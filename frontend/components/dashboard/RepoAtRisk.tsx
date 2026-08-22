'use client';

import React from 'react';
import Card from '@/components/ui/Card';
import { FolderGit2 } from 'lucide-react';

interface RepoRisk {
  name: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

const DEFAULT_REPOS: RepoRisk[] = [
  { name: 'payments-api',       critical: 4, high: 12, medium: 5, low: 2, total: 23 },
  { name: 'auth-service',       critical: 2, high: 7,  medium: 9, low: 4, total: 22 },
  { name: 'frontend',           critical: 0, high: 4,  medium: 8, low: 6, total: 18 },
  { name: 'ai-storage-service', critical: 3, high: 9,  medium: 3, low: 1, total: 16 },
];

const MAX_SQUARES = 24;

function RiskBar({ repo }: { repo: RepoRisk }) {
  const squares = Array.from({ length: MAX_SQUARES }, (_, i) => {
    const critThreshold = Math.round((repo.critical / repo.total) * MAX_SQUARES);
    const highThreshold = Math.round(((repo.critical + repo.high) / repo.total) * MAX_SQUARES);
    const medThreshold  = Math.round(((repo.critical + repo.high + repo.medium) / repo.total) * MAX_SQUARES);

    if (i < critThreshold) return '#F43F5E';
    if (i < highThreshold) return '#F97316';
    if (i < medThreshold)  return '#EAB308';
    return '#1B1720';
  });

  return (
    <div className="flex gap-0.5">
      {squares.map((color, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 2,
            background: color,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

interface RepoAtRiskProps {
  repos?: RepoRisk[];
}

export default function RepoAtRisk({ repos = DEFAULT_REPOS }: RepoAtRiskProps) {
  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>
            Repositories at Risk
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
            Severity distribution by repository
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {[['#F43F5E','Crit'],['#F97316','High'],['#EAB308','Med']].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1" style={{ color: 'var(--muted-2)' }}>
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Repo list */}
      <div className="space-y-4">
        {repos.map((repo) => (
          <div key={repo.name}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <FolderGit2 size={12} style={{ color: 'var(--muted-2)', flexShrink: 0 }} />
                <span className="font-mono text-[12px]" style={{ color: 'var(--foreground)' }}>
                  {repo.name}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px]">
                {repo.critical > 0 && (
                  <span style={{ color: '#F43F5E' }}>Crit: {repo.critical}</span>
                )}
                <span style={{ color: '#F97316' }}>High: {repo.high}</span>
              </div>
            </div>
            <RiskBar repo={repo} />
          </div>
        ))}
      </div>
    </Card>
  );
}
