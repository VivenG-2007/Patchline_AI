'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Code2,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  GitPullRequest,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  Lock,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ToastNotification';

export interface Finding {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  file: string;
  line: number;
  description: string;
  suggestedFix?: string;
  source?: 'deterministic' | 'ai';
  confidence?: 'high' | 'medium' | 'low';
  category?: string;
  ruleKey?: string;
  cwe?: string;
}

export interface FixStatus {
  phase: 'QUEUED' | 'PROCESSING' | 'VERIFIED' | 'FAILED' | null;
  fixBranch?: string;
  summary?: string;
  pullRequest?: { number: number; url: string };
  error?: string;
  attempts?: number;
}

interface FindingCardProps {
  finding: Finding;
  fixStatus?: FixStatus;
  onApproveAndFix: (findingId: string) => Promise<void> | void;
  onViewDeepTimeline?: (finding: Finding) => void;
}

const SEVERITY_TONE: Record<Finding['severity'], 'critical' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'critical',
  HIGH: 'critical',
  MEDIUM: 'warning',
  LOW: 'info',
};

export default function FindingCard({
  finding,
  fixStatus,
  onApproveAndFix,
  onViewDeepTimeline,
}: FindingCardProps) {
  const [diffExpanded, setDiffExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [copiedPatch, setCopiedPatch] = useState(false);
  const { addToast } = useToast();

  const attempts = fixStatus?.attempts || 0;
  const maxAttemptsReached = attempts >= 3;
  const isFixing = fixStatus?.phase === 'QUEUED' || fixStatus?.phase === 'PROCESSING' || approving;
  const isVerified = fixStatus?.phase === 'VERIFIED';
  const isFailed = fixStatus?.phase === 'FAILED';

  const defaultDiff =
    finding.suggestedFix ||
    `--- a/${finding.file}\n+++ b/${finding.file}\n@@ -${Math.max(1, finding.line - 2)},5 +${Math.max(1, finding.line - 2)},7 @@\n-  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;\n+  const query = 'SELECT * FROM users WHERE id = $1';\n+  const result = await db.query(query, [userId]);`;

  const handleApprove = async () => {
    if (maxAttemptsReached || isFixing) return;
    setApproving(true);
    try {
      await onApproveAndFix(finding.id);
      addToast({
        type: 'success',
        title: 'Remediation Authorized',
        message: `Synthesizing and verifying patch for ${finding.id} on isolated branch.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Authorization Error',
        message: err.message || 'Failed to dispatch remediation request.',
      });
    } finally {
      setApproving(false);
    }
  };

  const copyPatch = () => {
    navigator.clipboard.writeText(defaultDiff);
    setCopiedPatch(true);
    addToast({
      type: 'info',
      title: 'Patch Copied',
      message: 'Unified diff copied to system clipboard.',
      duration: 2500,
    });
    setTimeout(() => setCopiedPatch(false), 2000);
  };

  return (
    <Card className="p-5 overflow-hidden transition-all border-border-default hover:border-border-hover">
      {/* Flaw Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[finding.severity]} dot>
              {finding.severity}
            </Badge>

            <span className="font-mono text-xs text-text-muted px-2 py-0.5 rounded bg-bg-subtle border border-border-default">
              {finding.cwe || 'CWE-89'}
            </span>

            <span className="font-mono text-xs text-text-muted px-2 py-0.5 rounded bg-bg-subtle border border-border-default">
              ID: {finding.id}
            </span>

            {finding.source && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-accent-purple-soft text-accent-purple uppercase tracking-wider font-semibold">
                {finding.source === 'ai' ? 'AI Validated' : 'Deterministic SAST'}
              </span>
            )}

            {finding.confidence && (
              <span className="font-mono text-[10px] text-text-muted">
                Confidence: <strong className="text-text-primary capitalize">{finding.confidence}</strong>
              </span>
            )}
          </div>

          <h3 className="font-display text-base font-semibold text-text-primary leading-snug">
            {finding.title}
          </h3>

          <p className="text-xs text-text-secondary leading-relaxed max-w-3xl">
            {finding.description}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-text-muted pt-1">
            <span className="flex items-center gap-1 text-text-secondary">
              <FileCode size={13} className="text-accent-cyan" />
              <span className="text-text-primary font-medium">{finding.file}</span>
              <span className="text-accent-cyan">:{finding.line}</span>
            </span>

            {finding.category && (
              <span>Category: <strong className="text-text-secondary">{finding.category}</strong></span>
            )}
          </div>
        </div>

        {/* Human Authorization Gate */}
        <div className="flex flex-col sm:items-end gap-2.5 shrink-0 pt-2 md:pt-0">
          {isVerified ? (
            <div className="flex flex-col sm:items-end gap-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-emerald-soft text-accent-emerald border border-accent-emerald/30 font-mono text-xs font-semibold">
                <CheckCircle2 size={14} />
                Fix Verified &amp; Tested
              </div>
              {fixStatus?.pullRequest && (
                <a
                  href={fixStatus.pullRequest.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-accent-cyan hover:underline"
                >
                  <GitPullRequest size={13} />
                  PR #{fixStatus.pullRequest.number} <ExternalLink size={11} />
                </a>
              )}
            </div>
          ) : isFailed ? (
            <div className="flex flex-col sm:items-end gap-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-rose-soft text-accent-rose border border-accent-rose/30 font-mono text-xs">
                <AlertTriangle size={14} />
                Fix Failed Test Check
              </div>
              {!maxAttemptsReached && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleApprove}
                  disabled={isFixing}
                  className="text-xs"
                >
                  Retry ({3 - attempts} left)
                </Button>
              )}
            </div>
          ) : isFixing ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-bg-subtle border border-accent-cyan/30 text-accent-cyan font-mono text-xs">
              <Loader2 size={13} className="animate-spin" />
              Synthesizing Patch…
            </div>
          ) : (
            <div className="flex flex-col sm:items-end gap-1">
              <Button
                size="sm"
                variant="primary"
                onClick={handleApprove}
                disabled={maxAttemptsReached}
                className="gap-1.5"
              >
                <Sparkles size={13} />
                Approve &amp; Fix
              </Button>
              <span className="text-[10px] font-mono text-text-muted flex items-center gap-1">
                <Lock size={10} /> Human Gate (3 attempts max)
              </span>
            </div>
          )}

          {onViewDeepTimeline && (
            <button
              type="button"
              onClick={() => onViewDeepTimeline(finding)}
              className="text-xs font-mono text-accent-cyan hover:underline text-left sm:text-right"
            >
              5-Stage Timeline →
            </button>
          )}
        </div>
      </div>

      {/* Suggested Solution & Diff Box */}
      <div className="mt-4 pt-4 border-t border-border-default">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setDiffExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-text-secondary hover:text-text-primary transition-colors"
          >
            <Code2 size={13} className="text-accent-cyan" />
            <span>AI Suggested Remediation Patch</span>
            {diffExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {diffExpanded && (
            <button
              type="button"
              onClick={copyPatch}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-accent-cyan hover:underline transition-colors"
            >
              {copiedPatch ? <Check size={11} className="text-accent-emerald" /> : <Copy size={11} />}
              {copiedPatch ? 'Copied' : 'Copy Unified Diff'}
            </button>
          )}
        </div>

        {diffExpanded && (
          <div className="mt-3 rounded-xl bg-terminal-bg border border-white/10 p-4 font-mono text-xs overflow-x-auto animate-fade-rise-in">
            <div className="text-[11px] text-terminal-muted pb-2 border-b border-white/10 mb-2 flex items-center justify-between">
              <span>patchline_remediation.diff</span>
              <span className="text-accent-cyan">unified v1.2</span>
            </div>
            <pre className="text-terminal-text leading-relaxed">
              {defaultDiff.split('\n').map((line, idx) => {
                const isDel = line.startsWith('-');
                const isAdd = line.startsWith('+');
                const isHunk = line.startsWith('@@');

                return (
                  <div
                    key={idx}
                    className={`px-1.5 py-0.5 rounded ${
                      isDel
                        ? 'bg-accent-rose-soft/80 text-accent-rose-strong'
                        : isAdd
                          ? 'bg-accent-emerald-soft/80 text-accent-emerald-strong'
                          : isHunk
                            ? 'text-accent-cyan font-bold'
                            : 'text-terminal-muted'
                    }`}
                  >
                    {line}
                  </div>
                );
              })}
            </pre>
          </div>
        )}
      </div>
    </Card>
  );
}
