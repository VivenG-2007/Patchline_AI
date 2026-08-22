'use client';

import React, { useState } from 'react';
import Card from '@/components/ui/Card';

const VULN_TYPES = [
  'SQL Injection',
  'XSS',
  'Secrets',
  'Cmd Injection',
  'Weak Crypto',
  'Path Traversal',
];

const WEEKS = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'];

// Deterministic pseudo-random heat data (seeded by row+col so it's stable)
function heatValue(row: number, col: number): number {
  const seed = (row * 13 + col * 7 + row * col) % 17;
  const patterns = [0,0,1,0,2,1,0,3,2,1,0,1,2,3,2,1,0];
  return patterns[seed];
}

const HEAT_COLORS = ['#1B1720', '#241B2D', '#492052', '#7A247C', '#C026D3'];
const HEAT_LABELS = ['None', 'Low', 'Medium', 'High', 'Critical'];

interface Tooltip {
  row: number;
  col: number;
  x: number;
  y: number;
}

export default function VulnHeatmap() {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: 'var(--foreground)' }}>
            Vulnerability Heatmap
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
            Finding frequency — last 12 weeks
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted-2)' }}>Less</span>
          {HEAT_COLORS.map((c, i) => (
            <span
              key={i}
              className="w-3 h-3 rounded-sm inline-block"
              style={{ background: c }}
            />
          ))}
          <span className="text-[10px] font-mono" style={{ color: 'var(--muted-2)' }}>More</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 460 }}>
          {/* Week headers */}
          <div className="flex mb-1.5" style={{ paddingLeft: 88 }}>
            {WEEKS.map((w) => (
              <div
                key={w}
                className="flex-1 text-center text-[9px] font-mono"
                style={{ color: 'var(--muted-2)' }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Rows */}
          {VULN_TYPES.map((vuln, row) => (
            <div key={vuln} className="flex items-center mb-1">
              {/* Row label */}
              <div
                className="w-20 shrink-0 text-[10px] font-mono text-right pr-3 truncate"
                style={{ color: 'var(--muted)' }}
              >
                {vuln}
              </div>

              {/* Cells */}
              {WEEKS.map((_, col) => {
                const val = heatValue(row, col);
                const bg = HEAT_COLORS[val];
                const isHovered = tooltip?.row === row && tooltip?.col === col;

                return (
                  <div
                    key={col}
                    className="flex-1 mx-0.5"
                    style={{ position: 'relative' }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ row, col, x: rect.left, y: rect.top });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <div
                      className="rounded-sm transition-all duration-100"
                      style={{
                        height: 14,
                        background: bg,
                        border: isHovered ? '1px solid rgba(168,85,247,0.6)' : '1px solid transparent',
                        transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                        cursor: 'default',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Floating tooltip */}
      {tooltip !== null && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltip.x + 8,
            top: tooltip.y - 54,
          }}
        >
          <div
            className="px-2.5 py-1.5 rounded-lg font-mono text-[11px] whitespace-nowrap"
            style={{
              background: '#17141C',
              border: '1px solid #302A38',
              color: 'var(--foreground)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ color: 'var(--muted-2)', marginBottom: 2 }}>
              {WEEKS[tooltip.col]} — {VULN_TYPES[tooltip.row]}
            </div>
            <div style={{ color: '#C026D3' }}>
              {HEAT_LABELS[heatValue(tooltip.row, tooltip.col)]} intensity
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
