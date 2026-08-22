'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Package, GitBranch, Search, Plus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ProtectedShell from '@/components/ProtectedShell';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import EmptyState from '@/components/ui/EmptyState';
import { scannerApi } from '@/lib/api';

type ScanRecord = {
  scanId: string;
  repo: string;
  branch: string;
  scannedAt: string;
  findingsCount: number;
  status: string;
  blobUri?: string;
  fixBranch?: string;
  fixedAt?: string;
  findings?: Array<{
    id: string;
    title: string;
    severity: string;
    file: string;
    line: number;
    description: string;
    source?: 'deterministic' | 'ai';
  }>;
};

const STATUS_TONE: Record<string, 'warning' | 'success' | 'critical' | 'neutral'> = {
  COMPLETED_WAITING_APPROVAL: 'warning',
  FIX_VERIFIED: 'success',
  FIX_NEEDS_REVIEW: 'warning',
  FIX_FAILED: 'critical',
};

const SEVERITY_TONE: Record<string, 'critical' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'critical',
  HIGH: 'critical',
  MEDIUM: 'warning',
  LOW: 'info',
  INFO: 'neutral',
};

export default function ScanHistoryPage() {
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    scannerApi
      .history(50)
      .then(({ data }) => {
        const raw = data?.history ?? data ?? [];
        setRecords(Array.isArray(raw) ? raw : []);
      })
      .catch((err: any) => {
        setError(
          err?.response?.data?.error?.message ??
            err.message ??
            'Failed to load scan history — ensure ai-storage-service is running.'
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = (scanId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(scanId)) next.delete(scanId);
      else next.add(scanId);
      return next;
    });
  };

  // Fix-velocity series, derived entirely from the already-loaded records —
  // no separate endpoint. Groups by calendar day: findings discovered that
  // day vs findings whose fix was verified/applied that day (fixedAt).
  const velocitySeries = useMemo(() => {
    const byDay = new Map<string, { day: string; found: number; fixed: number; sortKey: string }>();
    const dayLabel = (iso: string) => {
      const d = new Date(iso);
      return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
    };
    for (const r of records) {
      if (r.scannedAt) {
        const { key, label } = dayLabel(r.scannedAt);
        const entry = byDay.get(key) ?? { day: label, found: 0, fixed: 0, sortKey: key };
        entry.found += r.findingsCount || 0;
        byDay.set(key, entry);
      }
      if (r.fixedAt) {
        const { key, label } = dayLabel(r.fixedAt);
        const entry = byDay.get(key) ?? { day: label, found: 0, fixed: 0, sortKey: key };
        entry.fixed += 1;
        byDay.set(key, entry);
      }
    }
    return Array.from(byDay.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(-14);
  }, [records]);

  return (
    <ProtectedShell>
      <PageHeader
        eyebrow="Azure Blob · MongoDB"
        title="Scan history"
        description="Every scan Patchline has run. Reports live in Blob Storage; metadata is indexed in MongoDB."
        action={
          <Link href="/scanner">
            <Button size="sm" className="gap-1.5">
              <Plus size={14} /> New scan
            </Button>
          </Link>
        }
      />

      {error && <Alert className="mb-6">{error}</Alert>}

      {loading && <p className="text-muted text-sm">Loading scan history…</p>}

      {!loading && !error && records.length === 0 && (
        <EmptyState
          icon={Search}
          title="No scans yet"
          description="Run your first scan to see results here."
          action={
            <Link href="/scanner" className="text-accent-strong text-sm hover:text-accent mt-1">
              Go to scanner
            </Link>
          }
        />
      )}

      {velocitySeries.length > 1 && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm text-ink">Fix Velocity</h2>
            <span className="text-[11px] font-mono text-faint">Findings found vs. fixed, per day</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={velocitySeries} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--color-faint)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-faint)" fontSize={11} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--color-ink)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--color-muted)' }} />
              <Bar dataKey="found" name="Found" fill="var(--color-warning)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="fixed" name="Fixed" fill="var(--color-success)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="space-y-3">
        {records.map((record) => {
          const isOpen = expanded.has(record.scanId);
          const tone = STATUS_TONE[record.status] ?? 'neutral';

          return (
            <Card key={record.scanId} className="overflow-hidden">
              <button type="button" onClick={() => toggleExpand(record.scanId)} className="w-full text-left px-5 py-4 flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm text-ink truncate">{record.repo}</span>
                    <span className="font-mono text-xs text-faint">({record.branch})</span>
                    <Badge tone={tone}>{record.status.replaceAll('_', ' ').toLowerCase()}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-muted">
                    <span>{new Date(record.scannedAt).toLocaleString()}</span>
                    <span className={record.findingsCount > 0 ? 'text-warning' : 'text-success'}>
                      {record.findingsCount} finding{record.findingsCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-faint truncate max-w-[200px]">{record.scanId}</span>
                  </div>
                  {record.fixBranch && (
                    <div className="font-mono text-xs text-success flex items-center gap-1.5">
                      <GitBranch size={12} />
                      {record.fixBranch}
                      {record.fixedAt && <span className="text-faint">({new Date(record.fixedAt).toLocaleString()})</span>}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {record.blobUri && (
                    <a
                      href={record.blobUri}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-2.5 py-1.5 bg-canvas border border-border hover:border-accent text-accent-strong font-mono text-xs rounded transition-colors inline-flex items-center gap-1.5"
                      title="Download raw JSON report from Azure Blob"
                    >
                      <Package size={12} /> Report
                    </a>
                  )}
                  {isOpen ? <ChevronUp size={15} className="text-faint" /> : <ChevronDown size={15} className="text-faint" />}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border bg-canvas px-5 py-4 space-y-3">
                  {!record.findings || record.findings.length === 0 ? (
                    <p className="text-sm text-success">No vulnerabilities found in this scan.</p>
                  ) : (
                    <>
                      <h3 className="text-xs text-muted uppercase tracking-wider font-mono mb-2">
                        Findings ({record.findings.length})
                      </h3>
                      {record.findings.map((f) => (
                        <div key={f.id} className="p-3.5 border border-border rounded-lg space-y-1.5 bg-surface">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={SEVERITY_TONE[f.severity] ?? 'neutral'}>{f.severity}</Badge>
                            <span className="font-medium text-sm text-ink">{f.title}</span>
                            <span className="text-faint font-mono text-xs">{f.id}</span>
                            {f.source && (
                              <span className="text-faint font-mono text-[10px] uppercase tracking-wide">
                                {f.source === 'ai' ? 'AI-found' : 'pattern-matched'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted leading-relaxed">{f.description}</p>
                          <p className="font-mono text-xs text-muted">
                            <span className="text-ink">{f.file}</span>
                            <span className="text-faint">:{f.line}</span>
                          </p>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </ProtectedShell>
  );
}
