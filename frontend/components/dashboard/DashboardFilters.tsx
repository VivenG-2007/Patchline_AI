'use client';

import React from 'react';
import { Search, Filter, RotateCcw, ArrowUpDown } from 'lucide-react';

export interface FilterState {
  searchQuery: string;
  status: string;
  severity: string;
  sortBy: 'recent' | 'risk_desc' | 'findings_desc';
}

interface DashboardFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onReset: () => void;
  totalCount: number;
  filteredCount: number;
}

export default function DashboardFilters({
  filters,
  onFilterChange,
  onReset,
  totalCount,
  filteredCount,
}: DashboardFiltersProps) {
  const isFiltered =
    filters.searchQuery !== '' ||
    filters.status !== 'ALL' ||
    filters.severity !== 'ALL' ||
    filters.sortBy !== 'recent';

  return (
    <div className="p-4 rounded-xl border border-border-default bg-bg-card mb-6 space-y-3">
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Real-time Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
            placeholder="Search repository, branch, scan ID, or vulnerability title…"
            className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-bg-subtle border border-border-default focus:border-accent-cyan text-xs text-text-primary placeholder:text-text-muted outline-none transition-all"
          />
        </div>

        {/* Status Dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={filters.status}
              onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg bg-bg-subtle border border-border-default focus:border-accent-cyan text-xs text-text-primary font-mono outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="Healthy">Healthy</option>
              <option value="Action Required">Action Required</option>
              <option value="Critical">Critical Alert</option>
            </select>
            <Filter size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          {/* Severity Dropdown */}
          <div className="relative">
            <select
              value={filters.severity}
              onChange={(e) => onFilterChange({ ...filters, severity: e.target.value })}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg bg-bg-subtle border border-border-default focus:border-accent-cyan text-xs text-text-primary font-mono outline-none cursor-pointer"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <Filter size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <select
              value={filters.sortBy}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  sortBy: e.target.value as FilterState['sortBy'],
                })
              }
              className="appearance-none pl-3 pr-8 py-2 rounded-lg bg-bg-subtle border border-border-default focus:border-accent-cyan text-xs text-text-primary font-mono outline-none cursor-pointer"
            >
              <option value="recent">Most Recent</option>
              <option value="risk_desc">Risk: High to Low</option>
              <option value="findings_desc">Findings Count</option>
            </select>
            <ArrowUpDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          {/* One-Click Reset Button */}
          {isFiltered && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-rose-soft hover:bg-accent-rose-soft/80 text-accent-rose text-xs font-mono transition-colors"
              title="Reset all search filters"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-text-muted pt-1 border-t border-border-default/60">
        <span>
          Showing <strong className="text-text-primary">{filteredCount}</strong> of {totalCount} repositories
        </span>
        {isFiltered && <span className="text-accent-cyan">Active filters applied</span>}
      </div>
    </div>
  );
}
