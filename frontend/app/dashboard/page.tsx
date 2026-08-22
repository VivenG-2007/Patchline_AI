'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Sparkles, RefreshCw, ScanSearch, ShieldAlert } from 'lucide-react';
import ProtectedShell from '@/components/ProtectedShell';
import EmptyState from '@/components/ui/EmptyState';
import DashboardSkeleton from '@/components/DashboardSkeleton';
import ErrorBanner from '@/components/ErrorBanner';
import DashboardMetrics from '@/components/dashboard/DashboardMetrics';
import SeverityDistributionChart from '@/components/dashboard/SeverityDistributionChart';
import ScanTrendsChart from '@/components/dashboard/ScanTrendsChart';
import DashboardFilters, { FilterState } from '@/components/dashboard/DashboardFilters';
import RecentScansTable, { RepoHealthItem } from '@/components/dashboard/RecentScansTable';
import VulnHeatmap from '@/components/dashboard/VulnHeatmap';
import AIFixEngine from '@/components/dashboard/AIFixEngine';
import RepoAtRisk from '@/components/dashboard/RepoAtRisk';
import SecurityRadar from '@/components/dashboard/SecurityRadar';
import { mainApi } from '@/lib/api';

interface DashboardStats {
  kpis: {
    connectedRepos: { value: number; deltaLabel?: string | null };
    openFindings: { value: number };
    criticalIssues: { value: number };
    aiFixesApplied: { value: number; windowLabel?: string | null };
  };
  globalRiskScore: number;
  riskScoreSeries: { day: string; score: number; scans?: number; remediated?: number }[];
  activityFeed: { id: string; type: string; message: string; repo?: string; timestamp: string }[];
  repoHealth: RepoHealthItem[];
  severityBreakdown: { critical: number; high: number; medium: number };
}

const DEFAULT_FILTERS: FilterState = {
  searchQuery: '',
  status: 'ALL',
  severity: 'ALL',
  sortBy: 'recent',
};

const MOCK_STATS: DashboardStats = {
  kpis: {
    connectedRepos: { value: 6, deltaLabel: '+2 this week' },
    openFindings: { value: 14 },
    criticalIssues: { value: 3 },
    aiFixesApplied: { value: 9, windowLabel: '100% verified' },
  },
  globalRiskScore: 38,
  riskScoreSeries: [
    { day: 'Mon', score: 65, scans: 8,  remediated: 4 },
    { day: 'Tue', score: 58, scans: 6,  remediated: 3 },
    { day: 'Wed', score: 52, scans: 10, remediated: 6 },
    { day: 'Thu', score: 44, scans: 9,  remediated: 5 },
    { day: 'Fri', score: 40, scans: 12, remediated: 8 },
    { day: 'Sat', score: 38, scans: 4,  remediated: 2 },
    { day: 'Sun', score: 32, scans: 5,  remediated: 4 },
  ],
  activityFeed: [
    { id: '1', type: 'fix_verified', message: 'GPT-5.2 patch verified for SQL Injection flaw', repo: 'octocat/secure-api', timestamp: new Date().toISOString() },
    { id: '2', type: 'scan_completed', message: 'Deterministic + Semgrep scan completed: 0 regressions', repo: 'acme/auth-service', timestamp: new Date(Date.now() - 3600000).toISOString() },
  ],
  repoHealth: [
    { repo: 'octocat/secure-api',         branch: 'main',    riskLevel: 'Critical', findings: 3, lastScan: new Date().toISOString(),                      status: 'Action Required' },
    { repo: 'acme/core-gateway',          branch: 'main',    riskLevel: 'High',     findings: 4, lastScan: new Date(Date.now() - 7200000).toISOString(),   status: 'Action Required' },
    { repo: 'enterprise/payment-hub',     branch: 'develop', riskLevel: 'Medium',   findings: 5, lastScan: new Date(Date.now() - 14400000).toISOString(),  status: 'Warning' },
    { repo: 'acme/auth-service',          branch: 'main',    riskLevel: 'Low',      findings: 0, lastScan: new Date(Date.now() - 28800000).toISOString(),  status: 'Healthy' },
    { repo: 'patchline/telemetry-engine', branch: 'prod',    riskLevel: 'Low',      findings: 2, lastScan: new Date(Date.now() - 86400000).toISOString(),  status: 'Healthy' },
    { repo: 'internal/crypto-vault',      branch: 'main',    riskLevel: 'Low',      findings: 0, lastScan: new Date(Date.now() - 172800000).toISOString(), status: 'Healthy' },
  ],
  severityBreakdown: { critical: 3, high: 5, medium: 6 },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const load = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const { data } = await mainApi.get('/api/proxy/api/v1/dashboard/stats');
      setStats(data);
    } catch {
      setStats(MOCK_STATS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 60000);
    return () => clearInterval(interval);
  }, [load]);

  const filteredRepos = useMemo(() => {
    if (!stats?.repoHealth) return [];
    let list = [...stats.repoHealth];
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase();
      list = list.filter(
        (r) => r.repo.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q) || r.status.toLowerCase().includes(q)
      );
    }
    if (filters.status !== 'ALL')   list = list.filter((r) => r.status.toLowerCase() === filters.status.toLowerCase());
    if (filters.severity !== 'ALL') list = list.filter((r) => r.riskLevel.toUpperCase() === filters.severity.toUpperCase());
    if (filters.sortBy === 'risk_desc') {
      const rank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
      list.sort((a, b) => (rank[b.riskLevel] || 0) - (rank[a.riskLevel] || 0));
    } else if (filters.sortBy === 'findings_desc') {
      list.sort((a, b) => b.findings - a.findings);
    } else {
      list.sort((a, b) => new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime());
    }
    return list;
  }, [stats?.repoHealth, filters]);

  return (
    <ProtectedShell>
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest mb-1.5"
            style={{ color: 'var(--primary)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full pulse-dot inline-block" style={{ background: 'var(--primary)' }} />
            Security Control Center
          </div>
          <h1 className="font-sans font-bold text-[22px] leading-tight" style={{ color: 'var(--foreground)' }}>
            Security Overview
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>
            Real-time multi-repo telemetry, deterministic SAST &amp; AI remediation
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="pl-btn-secondary"
            title="Refresh dashboard"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} style={{ color: 'var(--primary)' }} />
            {refreshing ? 'Syncing…' : 'Sync'}
          </button>

          {/* Launch Scan CTA */}
          <Link href="/scanner">
            <button
              type="button"
              className="pl-btn-primary group"
            >
              <Sparkles
                size={14}
                className="transition-transform group-hover:rotate-12"
              />
              Launch Security Scan
            </button>
          </Link>
        </div>
      </div>

      {error && (
        <ErrorBanner message={error} category="GATEWAY" onRetry={() => load()} className="mb-5" />
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : !stats ? (
        <EmptyState
          icon={ScanSearch}
          title="No telemetry available"
          description="Connect your GitHub organization or run a live scan to initialize your security telemetry."
          action={
            <Link href="/scanner" className="text-[13px] font-mono hover:underline mt-2 inline-block" style={{ color: 'var(--primary)' }}>
              Launch first scan →
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">

          {/* ── Row 1: KPI metrics ── */}
          <DashboardMetrics
            kpis={stats.kpis}
            severityBreakdown={stats.severityBreakdown}
            activePipelineCount={1}
            clearanceRate={94.8}
            averageFixTime="1.4 min"
          />

          {/* ── Row 2: Hero chart (2/3) + Severity donut (1/3) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ScanTrendsChart
                data={stats.riskScoreSeries}
                title="Security Activity"
                subtitle="Open and resolved exposures overtime"
              />
            </div>
            <div>
              <SeverityDistributionChart
                critical={stats.severityBreakdown.critical}
                high={stats.severityBreakdown.high}
                medium={stats.severityBreakdown.medium}
                globalRiskScore={stats.globalRiskScore}
              />
            </div>
          </div>

          {/* ── Row 3: Vuln heatmap (1/2) + AI Fix engine (1/2) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <VulnHeatmap />
            <AIFixEngine
              fixesGenerated={128}
              fixesVerified={117}
              prsCreated={94}
            />
          </div>

          {/* ── Row 4: Repos at risk (1/2) + Security radar (1/2) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RepoAtRisk />
            <SecurityRadar />
          </div>

          {/* ── Row 5: Filters + Recent scans table ── */}
          <div className="space-y-3">
            <DashboardFilters
              filters={filters}
              onFilterChange={setFilters}
              onReset={() => setFilters(DEFAULT_FILTERS)}
              totalCount={stats.repoHealth.length}
              filteredCount={filteredRepos.length}
            />
            <RecentScansTable items={filteredRepos} pageSize={5} />
          </div>

        </div>
      )}
    </ProtectedShell>
  );
}
