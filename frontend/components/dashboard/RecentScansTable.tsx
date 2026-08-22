'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { GitBranch, ExternalLink, ChevronRight, ChevronLeft, ShieldCheck, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

export interface RepoHealthItem {
  repo: string;
  branch: string;
  riskLevel: string;
  findings: number;
  lastScan: string;
  status: string;
  scanId?: string;
  fixBranch?: string;
}

interface RecentScansTableProps {
  items: RepoHealthItem[];
  pageSize?: number;
}

const RISK_BADGE: Record<string, 'critical' | 'warning' | 'info' | 'success'> = {
  Critical: 'critical',
  High: 'warning',
  Medium: 'info',
  Low: 'success',
};

function formatTime(iso: string) {
  if (!iso) return 'Recent';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function RecentScansTable({ items, pageSize = 5 }: RecentScansTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
        <div>
          <h2 className="font-display text-sm font-semibold text-text-primary">Repository Health &amp; Pipeline Status</h2>
          <p className="text-xs text-text-muted">Monitored repositories and continuous compliance status</p>
        </div>
        <span className="font-mono text-xs text-text-muted">
          Page {currentPage} of {totalPages}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border-default bg-bg-subtle/50 text-[11px] font-mono text-text-muted uppercase tracking-wider">
              <th className="px-5 py-3 font-semibold">Repository</th>
              <th className="px-4 py-3 font-semibold hidden sm:table-cell">Branch</th>
              <th className="px-4 py-3 font-semibold">Risk Tier</th>
              <th className="px-4 py-3 font-semibold">Findings</th>
              <th className="px-4 py-3 font-semibold hidden md:table-cell">Last Scanned</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {pagedItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-text-muted">
                  No repositories match your active filter criteria.
                </td>
              </tr>
            ) : (
              pagedItems.map((r) => {
                const [owner, name] = r.repo.includes('/') ? r.repo.split('/') : ['', r.repo];
                return (
                  <tr
                    key={r.repo}
                    className="hover:bg-bg-subtle/70 transition-colors group"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-bg-subtle border border-border-default flex items-center justify-center text-text-secondary shrink-0">
                          <GitBranch size={13} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-mono font-medium text-text-primary truncate">
                            {owner && <span className="text-text-muted">{owner}/</span>}
                            {name}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-text-secondary hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-bg-subtle border border-border-default text-[11px]">
                        {r.branch}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <Badge tone={RISK_BADGE[r.riskLevel] || 'neutral'} dot>
                        {r.riskLevel}
                      </Badge>
                    </td>

                    <td className="px-4 py-3.5 font-mono">
                      {r.findings > 0 ? (
                        <span className="text-accent-rose font-semibold">{r.findings} issues</span>
                      ) : (
                        <span className="text-accent-emerald flex items-center gap-1">
                          <CheckCircle2 size={12} /> Clean
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-text-muted font-mono hidden md:table-cell">
                      {formatTime(r.lastScan)}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            r.status === 'Healthy'
                              ? 'bg-accent-emerald'
                              : r.status === 'Action Required'
                                ? 'bg-accent-rose pulse-dot'
                                : 'bg-accent-amber'
                          }`}
                        />
                        <span className="text-text-secondary font-medium">{r.status}</span>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/scanner?repo=${encodeURIComponent(r.repo)}&branch=${encodeURIComponent(r.branch)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-bg-subtle hover:bg-accent-cyan-soft hover:text-accent-cyan text-text-secondary border border-border-default hover:border-accent-cyan/40 font-mono text-[11px] transition-all"
                      >
                        Inspect <ChevronRight size={11} />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-border-default flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-default bg-bg-card hover:bg-bg-subtle disabled:opacity-40 disabled:pointer-events-none transition-colors font-mono"
          >
            <ChevronLeft size={13} /> Previous
          </button>

          <span className="font-mono text-text-muted">
            {currentPage} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-default bg-bg-card hover:bg-bg-subtle disabled:opacity-40 disabled:pointer-events-none transition-colors font-mono"
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      )}
    </Card>
  );
}
