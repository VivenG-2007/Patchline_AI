'use client';

export default function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Top Welcome Heading Skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-lg bg-bg-card skeleton-shimmer" />
        <div className="h-4 w-96 rounded-md bg-bg-card skeleton-shimmer" />
      </div>

      {/* 4 Executive KPI Metric Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-xl border border-border-default bg-bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 rounded bg-bg-card-raised skeleton-shimmer" />
              <div className="w-8 h-8 rounded-lg bg-bg-card-raised skeleton-shimmer" />
            </div>
            <div className="h-7 w-20 rounded bg-bg-card-raised skeleton-shimmer" />
            <div className="h-3 w-32 rounded bg-bg-card-raised skeleton-shimmer" />
          </div>
        ))}
      </div>

      {/* Charts Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-xl border border-border-default bg-bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-4 w-40 rounded bg-bg-card-raised skeleton-shimmer" />
            <div className="h-3 w-20 rounded bg-bg-card-raised skeleton-shimmer" />
          </div>
          <div className="h-60 w-full rounded-lg bg-bg-card-raised skeleton-shimmer" />
        </div>

        <div className="p-5 rounded-xl border border-border-default bg-bg-card space-y-4">
          <div className="h-4 w-36 rounded bg-bg-card-raised skeleton-shimmer" />
          <div className="h-60 w-full rounded-lg bg-bg-card-raised skeleton-shimmer flex items-center justify-center">
            <div className="w-32 h-32 rounded-full border-4 border-border-default" />
          </div>
        </div>
      </div>

      {/* Table & Filter Skeletons */}
      <div className="rounded-xl border border-border-default bg-bg-card overflow-hidden">
        <div className="p-4 border-b border-border-default flex flex-wrap gap-3">
          <div className="h-9 flex-1 min-w-[200px] rounded-lg bg-bg-card-raised skeleton-shimmer" />
          <div className="h-9 w-32 rounded-lg bg-bg-card-raised skeleton-shimmer" />
          <div className="h-9 w-32 rounded-lg bg-bg-card-raised skeleton-shimmer" />
        </div>
        <div className="divide-y divide-border-default p-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="p-4 flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-48 rounded bg-bg-card-raised skeleton-shimmer" />
                <div className="h-3 w-32 rounded bg-bg-card-raised skeleton-shimmer" />
              </div>
              <div className="h-6 w-20 rounded-full bg-bg-card-raised skeleton-shimmer" />
              <div className="h-6 w-24 rounded bg-bg-card-raised skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
