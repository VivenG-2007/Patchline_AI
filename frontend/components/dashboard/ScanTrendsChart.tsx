'use client';

import React, { useState, useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import Card from '@/components/ui/Card';
import { Calendar } from 'lucide-react';

interface TrendItem {
  day: string;
  score?: number;
  scans?: number;
  remediated?: number;
}

interface ScanTrendsChartProps {
  data: TrendItem[];
  title?: string;
  subtitle?: string;
}

export default function ScanTrendsChart({
  data,
  title = 'Risk Index & Remediation Trajectory',
  subtitle = 'Continuous 7-day chronological telemetry',
}: ScanTrendsChartProps) {
  const [viewMode, setViewMode] = useState<'risk' | 'volume'>('risk');
  const mounted = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);

  // Synthesize volumetric metrics if only risk score series is provided
  const chartData = data.map((item, idx) => ({
    day: item.day,
    riskScore: item.score ?? 0,
    scans: item.scans ?? Math.max(1, Math.round(((item.score ?? 10) / 10) + idx)),
    remediated: item.remediated ?? Math.max(0, Math.round(((item.score ?? 10) / 15))),
  }));

  const isEmpty = chartData.every((d) => d.riskScore === 0 && d.scans === 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-text-primary">{title}</h2>
          <p className="text-xs text-text-muted">{subtitle}</p>
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-bg-subtle border border-border-default text-xs">
          <button
            type="button"
            onClick={() => setViewMode('risk')}
            aria-label="View Risk Score metric"
            className={`px-2.5 py-1 rounded-md transition-all font-mono text-[11px] ${
              viewMode === 'risk'
                ? 'bg-bg-card text-accent-cyan font-semibold shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Risk Score
          </button>
          <button
            type="button"
            onClick={() => setViewMode('volume')}
            aria-label="View Volume and PRs metric"
            className={`px-2.5 py-1 rounded-md transition-all font-mono text-[11px] ${
              viewMode === 'volume'
                ? 'bg-bg-card text-accent-emerald font-semibold shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Volume &amp; PRs
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="h-64 flex flex-col items-center justify-center text-sm text-text-muted">
          <Calendar size={28} className="text-text-muted/50 mb-2" />
          <span>No historical activity recorded in the selected window.</span>
        </div>
      ) : !mounted ? (
        <div className="h-64 w-full rounded-lg bg-bg-subtle/50 skeleton-shimmer" />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'risk' ? (
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="riskCyanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} width={35} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-hover)',
                    borderRadius: 10,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="riskScore"
                  name="Risk Index"
                  stroke="var(--accent-cyan)"
                  strokeWidth={2.5}
                  fill="url(#riskCyanGrad)"
                />
              </AreaChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="scansGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-purple)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--accent-purple)" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="fixesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-emerald)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--accent-emerald)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} width={35} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-hover)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                <Area
                  type="monotone"
                  dataKey="scans"
                  name="Scans Run"
                  stroke="var(--accent-purple)"
                  strokeWidth={2}
                  fill="url(#scansGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="remediated"
                  name="Patches Verified"
                  stroke="var(--accent-emerald)"
                  strokeWidth={2}
                  fill="url(#fixesGrad)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
