'use client';

import React, { useSyncExternalStore } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '@/components/ui/Card';
import { ShieldCheck } from 'lucide-react';

const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

interface SeverityDistributionProps {
  critical: number;
  high: number;
  medium: number;
  low?: number;
  globalRiskScore?: number;
}

export default function SeverityDistributionChart({
  critical,
  high,
  medium,
  low = 0,
  globalRiskScore = 32,
}: SeverityDistributionProps) {
  const mounted = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
  const total = critical + high + medium + low;

  const data = [
    { name: 'Critical', value: critical, color: 'var(--accent-rose)', tone: 'text-accent-rose bg-accent-rose-soft' },
    { name: 'High', value: high, color: 'var(--accent-amber)', tone: 'text-accent-amber bg-accent-amber-soft' },
    { name: 'Medium', value: medium, color: 'var(--accent-cyan)', tone: 'text-accent-cyan bg-accent-cyan-soft' },
    { name: 'Low', value: low, color: 'var(--accent-emerald)', tone: 'text-accent-emerald bg-accent-emerald-soft' },
  ].filter((d) => d.value > 0);

  return (
    <Card className="p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="font-display text-sm font-semibold text-text-primary">Severity Spectrum</h2>
          <p className="text-xs text-text-muted">Breakdown by CVSS risk tier</p>
        </div>
        <span className="font-mono text-xs text-text-muted px-2 py-0.5 rounded bg-bg-subtle border border-border-default">
          {total} issues
        </span>
      </div>

      {total === 0 ? (
        <div className="h-56 flex flex-col items-center justify-center text-center p-4">
          <div className="w-12 h-12 rounded-full bg-accent-emerald-soft text-accent-emerald flex items-center justify-center mb-2">
            <ShieldCheck size={24} />
          </div>
          <div className="text-sm font-medium text-text-primary">Zero Flaws Detected</div>
          <div className="text-xs text-text-muted mt-1">All connected repositories passed compliance checks.</div>
        </div>
      ) : !mounted ? (
        <div className="h-48 my-2 rounded-lg bg-bg-subtle/50 skeleton-shimmer" />
      ) : (
        <>
          <div className="relative h-48 my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0];
                      const pct = Math.round(((d.value as number) / total) * 100);
                      return (
                        <div className="p-2.5 rounded-lg bg-bg-card border border-border-hover shadow-xl font-mono text-xs">
                          <div className="font-semibold text-text-primary flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.payload.color }} />
                            {d.name}: {d.value} ({pct}%)
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Risk Index</span>
              <span className="font-display text-2xl font-bold text-text-primary tabular-nums">
                {globalRiskScore}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border-default">
            {data.map((item) => (
              <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-bg-subtle/50 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-text-secondary">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
                <span className="font-mono font-semibold text-text-primary">{item.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
