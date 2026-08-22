'use client';

import React from 'react';
import { Radar, ShieldAlert, GitPullRequest, Activity, TrendingUp, Sparkles } from 'lucide-react';
import Card from '@/components/ui/Card';

interface DashboardMetricsProps {
  kpis: {
    connectedRepos: { value: number; deltaLabel?: string | null };
    openFindings: { value: number };
    criticalIssues: { value: number };
    aiFixesApplied: { value: number; windowLabel?: string | null };
  };
  severityBreakdown: { critical: number; high: number; medium: number };
  activePipelineCount?: number;
  clearanceRate?: number;
  averageFixTime?: string;
}

export default function DashboardMetrics({
  kpis,
  severityBreakdown,
  activePipelineCount = 1,
  clearanceRate = 96.2,
  averageFixTime = '1.4 min',
}: DashboardMetricsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Total Scans & Clearance Rate */}
      <Card className="p-5 relative overflow-hidden group">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
              Clearance &amp; Coverage
            </div>
            <div className="font-display text-3xl font-bold text-text-primary">
              {kpis.connectedRepos.value} <span className="text-sm font-normal text-text-secondary">Repos</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent-cyan-soft text-accent-cyan flex items-center justify-center shrink-0 border border-accent-cyan/20 group-hover:scale-105 transition-transform">
            <Radar size={18} strokeWidth={2} />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border-default flex items-center justify-between text-xs">
          <span className="text-text-muted">Clearance Rate</span>
          <span className="font-mono font-medium text-accent-emerald flex items-center gap-1">
            <TrendingUp size={12} />
            {clearanceRate}% Clean
          </span>
        </div>
      </Card>

      {/* 2. Active Pipeline Live Beacon */}
      <Card className="p-5 relative overflow-hidden group">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
              Active Pipelines
            </div>
            <div className="font-display text-3xl font-bold text-text-primary">
              {activePipelineCount}{' '}
              <span className="text-sm font-normal text-text-secondary">Live</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent-emerald-soft text-accent-emerald flex items-center justify-center shrink-0 border border-accent-emerald/20 group-hover:scale-105 transition-transform relative">
            <Activity size={18} strokeWidth={2} />
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-accent-emerald pulse-dot" />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border-default flex items-center justify-between text-xs">
          <span className="text-text-muted">Worker Daemon</span>
          <span className="font-mono text-accent-emerald flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald pulse-dot" />
            Daemon Healthy
          </span>
        </div>
      </Card>

      {/* 3. Vulnerabilities & Severity Counter */}
      <Card className="p-5 relative overflow-hidden group">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
              Vulnerabilities
            </div>
            <div className="font-display text-3xl font-bold text-text-primary">
              {kpis.openFindings.value}{' '}
              <span className="text-sm font-normal text-text-secondary">Total</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent-rose-soft text-accent-rose flex items-center justify-center shrink-0 border border-accent-rose/20 group-hover:scale-105 transition-transform">
            <ShieldAlert size={18} strokeWidth={2} />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border-default flex items-center justify-between text-xs font-mono">
          <span className="text-accent-rose flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-rose" /> {severityBreakdown.critical} Crit
          </span>
          <span className="text-accent-amber flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-amber" /> {severityBreakdown.high} High
          </span>
          <span className="text-accent-cyan flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-cyan" /> {severityBreakdown.medium} Med
          </span>
        </div>
      </Card>

      {/* 4. Verified PRs & Average Velocity */}
      <Card className="p-5 relative overflow-hidden group">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-text-muted mb-1">
              Remediated &amp; Shipped
            </div>
            <div className="font-display text-3xl font-bold text-text-primary">
              {kpis.aiFixesApplied.value}{' '}
              <span className="text-sm font-normal text-text-secondary">PRs</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent-purple-soft text-accent-purple flex items-center justify-center shrink-0 border border-accent-purple/20 group-hover:scale-105 transition-transform">
            <GitPullRequest size={18} strokeWidth={2} />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border-default flex items-center justify-between text-xs">
          <span className="text-text-muted">Mean Time to Fix</span>
          <span className="font-mono text-accent-purple font-medium flex items-center gap-1">
            <Sparkles size={12} />
            {averageFixTime}
          </span>
        </div>
      </Card>
    </div>
  );
}
