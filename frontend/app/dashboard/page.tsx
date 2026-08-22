'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  GitBranch,
  ShieldAlert,
  AlertTriangle,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Wrench,
  Radar,
} from 'lucide-react';
import ProtectedShell from '@/components/ProtectedShell';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import EmptyState from '@/components/ui/EmptyState';
import LoadingScreen from '@/components/LoadingScreen';
import { mainApi } from '@/lib/api';

interface DashboardStats {
  kpis: {
    connectedRepos: { value: number; deltaLabel?: string | null };
    openFindings: { value: number };
    criticalIssues: { value: number };
    aiFixesApplied: { value: number; windowLabel?: string | null };
  };
  globalRiskScore: number;
  riskScoreSeries: { day: string; score: number }[];
  activityFeed: { id: string; type: string; message: string; repo?: string; timestamp: string }[];
  repoHealth: { repo: string; branch: string; riskLevel: string; findings: number; lastScan: string; status: string }[];
  severityBreakdown: { critical: number; high: number; medium: number };
}

const RISK_BADGE: Record<string, 'critical' | 'warning' | 'info' | 'success'> = {
  Critical: 'critical',
  High: 'warning',
  Medium: 'info',
  Low: 'success',
};

const ACTIVITY_ICON: Record<string, typeof Radar> = {
  scan_completed: Radar,
  fix_verified: ShieldCheck,
  fix_failed: AlertTriangle,
  critical_detected: ShieldAlert,
};

const ACTIVITY_TONE: Record<string, string> = {
  scan_completed: 'text-info bg-info-soft',
  fix_verified: 'text-success bg-success-soft',
  fix_failed: 'text-warning bg-warning-soft',
  critical_detected: 'text-critical bg-critical-soft',
};

function timeAgo(iso: string) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  tone = 'accent',
}: {
  icon: typeof GitBranch;
  label: string;
  value: number | string;
  delta?: string | null;
  tone?: 'accent' | 'critical' | 'success';
}) {
  const toneClasses = {
    accent: 'text-accent-strong bg-accent-soft',
    critical: 'text-critical bg-critical-soft',
    success: 'text-success bg-success-soft',
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted mb-1.5">{label}</div>
          <div className="font-display text-2xl text-ink">{value}</div>
        </div>
        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${toneClasses}`}>
          <Icon size={15} strokeWidth={1.75} />
        </div>
      </div>
      {delta && (
        <div className="flex items-center gap-1 mt-2 text-[11px] text-success">
          <ArrowUpRight size={12} />
          {delta}
        </div>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await mainApi.get('/api/proxy/api/v1/dashboard/stats');
      setStats(data);
    } catch (err: any) {
      setError(
        err?.response?.data?.error?.message ||
          'Could not load dashboard data — check that ai-storage-service is running.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return <LoadingScreen title="Loading your dashboard…" subtitle="Pulling the latest scan results across your repositories." durationMs={1200} />;
  }

  return (
    <ProtectedShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl md:text-3xl text-ink">Good morning.</h1>
        <p className="text-muted text-sm mt-1.5">Here&apos;s what PatchLine found across your repositories.</p>
      </div>

      {error && <Alert className="mb-6">{error}</Alert>}

      {!stats || (stats.repoHealth.length === 0 && !error) ? (
        <EmptyState
          icon={Radar}
          title="No scans yet"
          description="Connect a repository and run your first scan to populate this dashboard with real findings."
          action={
            <Link href="/scanner" className="text-sm text-accent-strong hover:underline mt-1">
              Go to Scanner →
            </Link>
          }
        />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard icon={GitBranch} label="Connected Repos" value={stats.kpis.connectedRepos.value} delta={stats.kpis.connectedRepos.deltaLabel} />
            <KpiCard icon={AlertTriangle} label="Open Findings" value={stats.kpis.openFindings.value} tone="accent" />
            <KpiCard icon={ShieldAlert} label="Critical Issues" value={stats.kpis.criticalIssues.value} tone="critical" />
            <KpiCard icon={Sparkles} label="AI Fixes Applied" value={stats.kpis.aiFixesApplied.value} delta={stats.kpis.aiFixesApplied.windowLabel} tone="success" />
          </div>

          <div className="grid lg:grid-cols-[2fr_1fr] gap-6 mb-6">
            {/* Risk score chart */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-sm text-ink">Risk Score Over Time</h2>
                <span className="text-[11px] font-mono text-faint">Last 7 days</span>
              </div>
              {stats.riskScoreSeries.every((d) => d.score === 0) ? (
                <div className="h-56 flex items-center justify-center text-sm text-faint">No risk activity in the last 7 days</div>
              ) : (
                <ResponsiveContainer width="100%" height={224}>
                  <AreaChart data={stats.riskScoreSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="day" stroke="var(--color-faint)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-faint)" fontSize={11} tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border-strong)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--color-ink)',
                      }}
                    />
                    <Area type="monotone" dataKey="score" stroke="var(--color-accent)" strokeWidth={2} fill="url(#riskFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Global risk score gauge-ish card */}
            <Card className="p-5 flex flex-col items-center justify-center text-center">
              <div className="text-xs text-muted mb-3">Global Risk Score</div>
              <div
                className={`w-24 h-24 rounded-full border-4 flex items-center justify-center font-display text-2xl ${
                  stats.globalRiskScore >= 60
                    ? 'border-critical text-critical'
                    : stats.globalRiskScore >= 30
                      ? 'border-warning text-warning'
                      : 'border-success text-success'
                }`}
              >
                {stats.globalRiskScore}
              </div>
              <div className="text-[11px] text-faint mt-3">
                {stats.globalRiskScore >= 60 ? 'High Risk' : stats.globalRiskScore >= 30 ? 'Moderate Risk' : 'Low Risk'}
              </div>
              <div className="flex items-center gap-3 mt-4 text-[11px]">
                <span className="flex items-center gap-1 text-critical">
                  <span className="w-1.5 h-1.5 rounded-full bg-critical" /> {stats.severityBreakdown.critical}
                </span>
                <span className="flex items-center gap-1 text-warning">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning" /> {stats.severityBreakdown.high}
                </span>
                <span className="flex items-center gap-1 text-info">
                  <span className="w-1.5 h-1.5 rounded-full bg-info" /> {stats.severityBreakdown.medium}
                </span>
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
            {/* Repo health */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-display text-sm text-ink">Repository Health</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-faint uppercase tracking-wide border-b border-border">
                      <th className="text-left font-medium px-5 py-2.5">Repository</th>
                      <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Branch</th>
                      <th className="text-left font-medium px-3 py-2.5">Risk</th>
                      <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Findings</th>
                      <th className="text-left font-medium px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.repoHealth.map((r) => (
                      <tr key={r.repo} className="border-b border-border last:border-0 hover:bg-surface transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-ink">{r.repo}</td>
                        <td className="px-3 py-3 font-mono text-xs text-muted hidden sm:table-cell">{r.branch}</td>
                        <td className="px-3 py-3">
                          <Badge tone={RISK_BADGE[r.riskLevel] || 'neutral'}>{r.riskLevel}</Badge>
                        </td>
                        <td className="px-3 py-3 text-muted hidden sm:table-cell">{r.findings}</td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-1.5 text-xs text-muted">
                            <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'Healthy' ? 'bg-success' : r.status === 'Action Required' ? 'bg-critical' : 'bg-warning'}`} />
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Activity feed */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-display text-sm text-ink">Activity Feed</h2>
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {stats.activityFeed.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-faint">No recent activity</div>
                ) : (
                  stats.activityFeed.map((item) => {
                    const Icon = ACTIVITY_ICON[item.type] || Wrench;
                    return (
                      <div key={item.id} className="flex gap-3 px-5 py-3 border-b border-border last:border-0">
                        <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center ${ACTIVITY_TONE[item.type] || 'text-muted bg-surface'}`}>
                          <Icon size={13} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] text-ink leading-snug">{item.message}</div>
                          <div className="text-[11px] text-faint mt-0.5 font-mono">
                            {item.repo} · {timeAgo(item.timestamp)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </ProtectedShell>
  );
}
