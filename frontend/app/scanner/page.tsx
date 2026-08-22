'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Radar, GitBranch, FileWarning, ExternalLink, Sparkles } from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import ProtectedShell from '@/components/ProtectedShell';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import ScanProgress from '@/components/ScanProgress';
import RagMemoryTrace from '@/components/RagMemoryTrace';
import { scannerApi, githubApi } from '@/lib/api';

type Repo = { id: number; fullName: string; private: boolean; url: string; description: string | null };
type Finding = {
  id: string;
  title: string;
  // Backend normalizes every finding — deterministic or AI — onto this
  // 4-level scale before it's ever returned (see ai-storage-service's
  // app/services/severity.py). No 5th "INFO" value reaches the frontend.
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  file: string;
  line: number;
  description: string;
  suggestedFix?: string;
  source?: 'deterministic' | 'ai';
  category?: string;
  // Only ever set for source="ai" findings — the model's own stated
  // confidence that this is a real, exploitable issue. Deterministic
  // findings don't carry this (a rule either matched or it didn't).
  confidence?: 'high' | 'medium' | 'low';
};
type ScanResult = {
  scanId: string;
  status: string;
  repo: string;
  findingsCount: number;
  findings: Finding[];
  blobUri?: string;
  jiraTicket?: { key: string; url: string };
  scanTier?: 'full' | 'batched' | 'deterministic_only';
  aiAnalysisNote?: string;
  // RAG "Remember" step — whether this scan's findings were queued for
  // embedding into memory as they were saved (app/core/memory_store.py).
  // Doesn't confirm each one succeeded; just whether the pipeline is on.
  ragMemoryEnabled?: boolean;
};
type SimilarPastFix = {
  similarity: number;
  title?: string;
  category?: string;
  severity?: string;
  file?: string;
  fixSummary?: string;
  verified: boolean;
};
type FixResult = {
  verified: boolean;
  fixBranch: string;
  summary: string;
  details?: string;
  pullRequest?: { number: number; url: string };
  // RAG "Recall" step — past fixes retrieved for this account before the
  // fix prompt was built. [] when memory is off, nothing similar existed
  // yet, or retrieval failed silently (it never blocks fix generation).
  similarPastFixes?: SimilarPastFix[];
};
type FixState = {
  phase: 'FIX_QUEUED' | 'FIX_PROCESSING' | null; // null once settled (result or error present)
  result?: FixResult;
  error?: string;
};

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // scans/fixes on huge repos can take a while, but don't poll forever

function pollUntil<T>(check: () => Promise<{ done: boolean; value?: T; failed?: boolean; error?: string }>): Promise<T> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        reject(new Error('Timed out waiting for the background job to finish. Check /scanner/history shortly.'));
        return;
      }
      try {
        const result = await check();
        if (result.failed) {
          reject(new Error(result.error || 'Background job failed'));
        } else if (result.done) {
          resolve(result.value as T);
        } else {
          setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (err) {
        reject(err);
      }
    };
    tick();
  });
}

const SEVERITY_TONE: Record<Finding['severity'], 'critical' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'critical',
  HIGH: 'critical',
  MEDIUM: 'warning',
  LOW: 'info',
};

export default function ScannerDashboardPage() {
  return (
    <Suspense fallback={null}>
      <ScannerDashboard />
    </Suspense>
  );
}

function ScannerDashboard() {
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null); // null = checking
  const [userRepos, setUserRepos] = useState<Repo[]>([]);
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [branch, setBranch] = useState('main');
  const [repoFilter, setRepoFilter] = useState('');

  const [loading, setLoading] = useState(false);
  const [scanPhase, setScanPhase] = useState<string | null>(null); // 'QUEUED' | 'PROCESSING' while waiting on the worker
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [fixStates, setFixStates] = useState<Record<string, FixState>>({}); // per-finding fix status, keyed by finding id
  const [fixingAll, setFixingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const searchParams = useSearchParams();
  const scanIdParam = searchParams.get('scanId');

  /* ── If a scanId is present in the URL (e.g. a link shared from Jira or
     /scanner/history), load that scan directly instead of showing the
     "start a new scan" form. ── */
  useEffect(() => {
    if (!scanIdParam) return;
    setLoadingExisting(true);
    setError(null);

    scannerApi
      .status(scanIdParam)
      .then(({ data }) => {
        setScanResult({ scanId: scanIdParam, ...data } as ScanResult);
      })
      .catch((err) => {
        setError(
          err?.response?.data?.error?.message ??
          err?.response?.data?.message ??
          `Couldn't load scan ${scanIdParam}. It may not exist, or you may not have access to it.`
        );
      })
      .finally(() => setLoadingExisting(false));
  }, [scanIdParam]);

  /* ── Check GitHub OAuth connection on mount ── */
  useEffect(() => {
    githubApi
      .status()
      .then(({ data }) => {
        setGithubConnected(data.connected ?? false);
        if (data.connected) {
          return githubApi.listRepos();
        }
      })
      .then((res) => {
        if (res?.data) {
          // Normalize: API may return a plain array or { repos: [] } / { data: [] }
          const raw = res.data;
          const arr = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.repos)
              ? raw.repos
              : Array.isArray(raw?.data)
                ? raw.data
                : [];
          setUserRepos(arr);
        }
      })
      .catch(() => setGithubConnected(false));
  }, []);

  const filteredRepos = (Array.isArray(userRepos) ? userRepos : []).filter((r) =>
    r.fullName?.toLowerCase().includes(repoFilter.toLowerCase())
  );

  const handleSelectRepo = (fullName: string) => {
    if (!fullName) return;
    const [owner, name] = fullName.split('/');
    setRepoOwner(owner);
    setRepoName(name);
  };

  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setScanResult(null);
    setFixStates({});
    setScanPhase('QUEUED');

    try {
      // POST /scan now just enqueues a BullMQ job and returns 202 immediately —
      // the actual scan runs in a background worker (see workers/scannerWorkers.js).
      const { data: queued } = await scannerApi.scan({ repoOwner, repoName, branch });
      setScanPhase(queued.status);

      const finalScan = await pollUntil<ScanResult>(async () => {
        const { data } = await scannerApi.status(queued.scanId);
        setScanPhase(data.status);
        if (data.status === 'COMPLETED_WAITING_APPROVAL') {
          return { done: true, value: { scanId: queued.scanId, ...data } as ScanResult };
        }
        if (data.status === 'SCAN_FAILED') {
          return { done: true, failed: true, error: data.error };
        }
        return { done: false };
      });

      setScanResult(finalScan);
    } catch (err: any) {
      setError(
        err?.response?.data?.error?.message ??
        err?.response?.data?.message ??
        err.message ??
        'Scan failed — ensure main-service (port 5001) and ai-storage-service (port 5002) are running.'
      );
    } finally {
      setLoading(false);
      setScanPhase(null);
    }
  };

  // Core fix flow for a single finding. Shared by the per-row "Approve & fix"
  // button and by "Fix all" so behavior stays identical either way.
  const runFix = async (findingId: string) => {
    if (!scanResult) return;
    setFixStates((prev) => ({ ...prev, [findingId]: { phase: 'FIX_QUEUED' } }));

    try {
      // POST /approve-fix also just enqueues and returns 202 — the fix
      // generation, GitHub commit, verification, and PR creation all happen
      // in a background worker with bounded retries.
      const { data: queued } = await scannerApi.approveAndFix({ scanId: scanResult.scanId, findingId });
      setFixStates((prev) => ({ ...prev, [findingId]: { phase: queued.status } }));

      const finalFix = await pollUntil<FixResult>(async () => {
        const { data } = await scannerApi.status(scanResult.scanId);
        const fixRecord = data.fixes?.[findingId];
        if (!fixRecord) return { done: false };
        setFixStates((prev) => ({ ...prev, [findingId]: { phase: fixRecord.status } }));
        if (fixRecord.status === 'FIX_VERIFIED' || fixRecord.status === 'FIX_NEEDS_REVIEW') {
          return { done: true, value: fixRecord as FixResult };
        }
        if (fixRecord.status === 'FIX_FAILED') {
          return { done: true, failed: true, error: fixRecord.error };
        }
        return { done: false };
      });

      setFixStates((prev) => ({ ...prev, [findingId]: { phase: null, result: finalFix } }));
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err.message ?? 'Fix generation or verification failed';
      setFixStates((prev) => ({ ...prev, [findingId]: { phase: null, error: message } }));
    }
  };

  const handleApproveFix = (findingId: string) => {
    if (fixStates[findingId]?.phase != null) return; // already in flight — avoid duplicate 409s
    setError(null);
    runFix(findingId);
  };

  // Runs every not-yet-resolved finding through the same approve-fix flow,
  // one at a time. Sequential on purpose: the worker commits each fix to a
  // shared branch on the target repo, so firing all findings at once risks
  // racing commits against each other.
  const handleFixAll = async () => {
    if (!scanResult || fixingAll) return;
    setFixingAll(true);
    setError(null);

    const pending = scanResult.findings.filter((f) => {
      const state = fixStates[f.id];
      return !state?.result && state?.phase == null; // skip completed AND already in-flight findings
    });
    for (const f of pending) {
      await runFix(f.id);
    }

    setFixingAll(false);
  };

  const totalFindings = scanResult?.findings.length ?? 0;
  const fixedCount = scanResult
    ? scanResult.findings.filter((f) => fixStates[f.id]?.result).length
    : 0;
  const pendingFixCount = totalFindings - fixedCount;

  return (
    <ProtectedShell>
      <PageHeader
        eyebrow="AI vulnerability scanner"
        title="Scanner"
        description="Scan a repository, review AI-generated findings, and approve fixes individually. Nothing merges without your review."
      />

      {error && <Alert className="mb-6">{error}</Alert>}

      {githubConnected === false && (
        <Alert tone="warning" className="mb-6">
          GitHub isn&apos;t connected — connect it to pick from your repositories, or type any repo below manually.{' '}
          <Link href="/github" className="underline underline-offset-2 hover:text-ink">
            Connect GitHub
          </Link>
        </Alert>
      )}

      {/* Loading an existing scan referenced by ?scanId=... (e.g. from a Jira link) */}
      {loadingExisting && (
        <Card className="p-6 mb-6 relative overflow-hidden">
          <div className="scanline" />
          <div className="flex items-center gap-3">
            <Badge tone="warning" dot>
              Loading
            </Badge>
            <p className="text-sm text-muted">Loading scan {scanIdParam}…</p>
          </div>
        </Card>
      )}

      {/* ── Step 1: Repo selection ── hidden once an existing scan is loaded via ?scanId= */}
      {!scanIdParam && (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-5">
            <h2 className="font-mono text-xs font-semibold text-accent-strong uppercase tracking-wide">Target repository</h2>
            {githubConnected && (
              <Badge tone="success" dot>
                {userRepos.length} repos loaded
              </Badge>
            )}
            {githubConnected === null && <span className="text-xs text-faint">Checking connection…</span>}
          </div>

          {githubConnected && userRepos.length > 0 && (
            <div className="space-y-2 mb-5">
              <input
                type="text"
                placeholder="Filter your repositories…"
                value={repoFilter}
                onChange={(e) => setRepoFilter(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-md text-sm text-ink placeholder:text-faint focus:border-accent outline-none transition-colors"
              />
              <div className="max-h-44 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {filteredRepos.length === 0 && <p className="text-xs text-faint px-3 py-2">No repos match that filter.</p>}
                {filteredRepos.map((r) => {
                  const isSelected = `${repoOwner}/${repoName}` === r.fullName;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleSelectRepo(r.fullName)}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 text-sm transition-colors hover:bg-surface-raised ${isSelected ? 'bg-accent-soft text-accent-strong' : 'text-ink'
                        }`}
                    >
                      <span className="font-mono text-xs">{r.fullName}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.private && <Badge tone="neutral">Private</Badge>}
                        {isSelected && <span className="text-success text-xs">Selected</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <form onSubmit={handleStartScan} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  Owner <span className="text-critical">*</span>
                </label>
                <input
                  type="text"
                  placeholder="octocat"
                  value={repoOwner}
                  onChange={(e) => setRepoOwner(e.target.value)}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-md text-sm text-ink placeholder:text-faint focus:border-accent outline-none transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  Repository <span className="text-critical">*</span>
                </label>
                <input
                  type="text"
                  placeholder="my-backend"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-md text-sm text-ink placeholder:text-faint focus:border-accent outline-none transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Branch</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-md text-sm text-ink placeholder:text-faint focus:border-accent outline-none transition-colors"
                />
              </div>
            </div>

            <Button type="submit" disabled={loading || !repoOwner || !repoName} className="w-full md:w-auto gap-2">
              <Radar size={15} strokeWidth={1.75} />
              {loading
                ? scanPhase === 'QUEUED'
                  ? 'Queued…'
                  : scanPhase === 'PROCESSING'
                    ? 'Scanning…'
                    : 'Working…'
                : `Scan ${repoOwner && repoName ? `${repoOwner}/${repoName}` : 'repository'}`}
            </Button>
          </form>
        </Card>
      )}

      {/* Background job still queued/running — scanResult isn't populated yet */}
      {loading && !scanResult && (
        <ScanProgress phase={scanPhase} repo={`${repoOwner}/${repoName}`} />
      )}

      {/* ── Step 2: Findings + approval ── */}
      {scanResult && (
        <Card className="relative overflow-hidden p-6 mb-6">
          {loading && <div className="scanline" />}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 mb-5">
            <div>
              <h2 className="font-mono text-xs font-semibold text-accent-strong uppercase tracking-wide">Findings</h2>
              <p className="text-sm text-muted mt-1">
                {scanResult.repo} — <span className="text-ink">{scanResult.findingsCount} issue(s)</span> detected
                {' '}
                <span className="text-faint">
                  ({scanResult.findings.filter((f) => f.source !== 'ai').length} pattern-matched,{' '}
                  {scanResult.findings.filter((f) => f.source === 'ai').length} AI-found extra)
                </span>
                {fixedCount > 0 && (
                  <span className="text-faint">
                    {' '}
                    — <span className="text-success">{fixedCount}/{totalFindings} fixed</span>
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge tone="warning">{scanResult.status.replaceAll('_', ' ').toLowerCase()}</Badge>
              {scanResult.findings.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleFixAll}
                  disabled={fixingAll || pendingFixCount === 0}
                  className="gap-2"
                >
                  <Sparkles size={13} strokeWidth={1.75} />
                  {fixingAll
                    ? `Fixing all… (${fixedCount}/${totalFindings})`
                    : pendingFixCount === 0
                      ? 'All fixed'
                      : `Fix all (${pendingFixCount})`}
                </Button>
              )}
            </div>
          </div>

          {scanResult.aiAnalysisNote && (
            <Alert tone="warning" className="mb-5">
              {scanResult.aiAnalysisNote}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4 mb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
                const count = scanResult.findings.filter((f) => f.severity === sev).length;
                const toneClass =
                  sev === 'CRITICAL' ? 'text-critical bg-critical-soft border-critical/20' :
                  sev === 'HIGH' ? 'text-warning bg-warning-soft border-warning/20' :
                  sev === 'MEDIUM' ? 'text-info bg-info-soft border-info/20' :
                  'text-muted bg-surface border-border';
                return (
                  <div key={sev} className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
                    <div className="text-[10px] font-mono uppercase tracking-wide opacity-80">{sev}</div>
                    <div className="font-display text-xl mt-0.5">{count}</div>
                  </div>
                );
              })}
            </div>

            {scanResult.findings.length > 0 && (() => {
              // Same four values the summary badges above iterate — previously
              // this included a 5th "INFO" bucket the badges didn't, so the
              // two totals on this page could disagree for the same dataset.
              const bySeverity = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const)
                .map((sev) => ({ name: sev, value: scanResult.findings.filter((f) => f.severity === sev).length }))
                .filter((d) => d.value > 0);
              const COLORS: Record<string, string> = {
                CRITICAL: 'var(--color-critical)',
                HIGH: 'var(--color-warning)',
                MEDIUM: 'var(--color-info)',
                LOW: 'var(--color-muted)',
              };
              return (
                <Card className="p-3 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie data={bySeverity} dataKey="value" nameKey="name" innerRadius={28} outerRadius={48} paddingAngle={2}>
                        {bySeverity.map((d) => (
                          <Cell key={d.name} fill={COLORS[d.name]} stroke="var(--color-surface)" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'var(--color-surface-raised)',
                          border: '1px solid var(--color-border-strong)',
                          borderRadius: 8,
                          fontSize: 11,
                          color: 'var(--color-ink)',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10, color: 'var(--color-muted)' }} layout="vertical" align="right" verticalAlign="middle" />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs bg-canvas p-4 rounded-lg border border-border mb-5">
            <div>
              <span className="text-faint">Scan ID</span> <span className="text-ink">{scanResult.scanId}</span>
            </div>
            <div>
              <span className="text-faint">Report</span>{' '}
              {scanResult.blobUri ? (
                <a href={scanResult.blobUri} target="_blank" rel="noreferrer" className="text-accent-strong hover:text-accent inline-flex items-center gap-1">
                  View JSON <ExternalLink size={11} />
                </a>
              ) : (
                <span className="text-faint">Not available</span>
              )}
            </div>
            {scanResult.jiraTicket && (
              <div className="col-span-full">
                <span className="text-faint">Jira ticket</span>{' '}
                <a href={scanResult.jiraTicket.url} target="_blank" rel="noreferrer" className="text-accent-strong hover:text-accent inline-flex items-center gap-1">
                  {scanResult.jiraTicket.key} <ExternalLink size={11} />
                </a>
              </div>
            )}
            {scanResult.ragMemoryEnabled && scanResult.findings.length > 0 && (
              <div className="col-span-full">
                <span className="text-faint">RAG memory</span>{' '}
                <span className="text-ink">{scanResult.findings.length} finding(s) indexed for semantic recall on future fixes</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {scanResult.findings.length === 0 && (
              <Alert tone="success">No vulnerabilities found. This repository looks clean.</Alert>
            )}
            {scanResult.findings.map((f) => {
              const fixState = fixStates[f.id];
              const isFixing = fixState?.phase != null;
              return (
                <div key={f.id} className={`p-4 border-l-4 border border-border bg-canvas rounded-lg space-y-2.5 ${
                  f.severity === 'CRITICAL' ? 'border-l-critical' : f.severity === 'HIGH' ? 'border-l-warning' : f.severity === 'MEDIUM' ? 'border-l-info' : 'border-l-border-strong'
                }`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                        <span className="font-display text-sm text-ink">{f.title}</span>
                        <span className="font-mono text-xs text-faint">{f.id}</span>
                        {f.source === 'ai' ? (
                          <Badge tone="neutral">AI-found (extra)</Badge>
                        ) : (
                          <Badge tone="neutral">Pattern-matched</Badge>
                        )}
                        {/* Only AI findings carry a confidence signal — a deterministic rule either
                            matched or it didn't, there's no gradient to flag. A "low" AI finding is
                            visibly more provisional than a "high" one instead of every AI finding
                            looking identically authoritative. */}
                        {f.source === 'ai' && f.confidence === 'low' && (
                          <Badge tone="warning">Low confidence — verify before fixing</Badge>
                        )}
                        {fixState?.result?.verified && <Badge tone="success">Fix verified</Badge>}
                        {fixState?.result && !fixState.result.verified && <Badge tone="warning">Needs review</Badge>}
                        {fixState?.error && <Badge tone="critical">Fix failed</Badge>}
                      </div>
                      <p className="text-sm text-muted leading-relaxed">{f.description}</p>
                      <div className="font-mono text-xs text-muted flex items-center gap-1.5">
                        <FileWarning size={12} />
                        <span className="text-ink">{f.file}</span>
                        <span className="text-faint">:{f.line}</span>
                      </div>
                      {f.suggestedFix && (
                        <div className="text-xs text-success/90 bg-success-soft px-3 py-2 rounded border border-success/20 leading-relaxed">
                          Suggested fix — {f.suggestedFix}
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleApproveFix(f.id)}
                      disabled={isFixing || fixingAll}
                      className="shrink-0"
                    >
                      {isFixing
                        ? fixState?.phase === 'FIX_QUEUED'
                          ? 'Queued…'
                          : fixState?.phase === 'FIX_PROCESSING'
                            ? 'Patching…'
                            : 'Working…'
                        : fixState?.result
                          ? 'Re-approve & fix'
                          : 'Approve & fix'}
                    </Button>
                  </div>

                  {/* Per-finding fix result, shown inline once this one settles */}
                  {fixState?.result && (
                    <div
                      className={`text-xs rounded border px-3 py-2 space-y-1.5 ${fixState.result.verified
                          ? 'text-success/90 bg-success-soft border-success/20'
                          : 'text-warning/90 bg-warning-soft border-warning/20'
                        }`}
                    >
                      {fixState.result.fixBranch && (
                        <p className="flex items-center gap-1.5 font-mono">
                          <GitBranch size={12} />
                          {fixState.result.fixBranch}
                        </p>
                      )}
                      {fixState.result.summary && <p>{fixState.result.summary}</p>}
                      {fixState.result.pullRequest && (
                        <a
                          href={fixState.result.pullRequest.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline underline-offset-2"
                        >
                          View pull request #{fixState.result.pullRequest.number} <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  )}
                  {fixState?.error && (
                    <div className="text-xs text-critical bg-critical-soft border border-critical/20 rounded px-3 py-2">
                      {fixState.error}
                    </div>
                  )}

                  {/* RAG memory trace — Recall (before/while fixing) and Remember
                      (once settled). Renders nothing if RAG memory is off. */}
                  <RagMemoryTrace
                    ragMemoryEnabled={!!scanResult.ragMemoryEnabled}
                    phase={fixState?.phase ?? null}
                    settled={!!fixState?.result}
                    similarPastFixes={fixState?.result?.similarPastFixes}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </ProtectedShell>
  );
}