'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ShieldAlert, X } from 'lucide-react';
import { mainApi } from '@/lib/api';

interface SearchResult {
  scanId: string;
  findingId: string;
  repo: string;
  title: string;
  file: string;
  severity: string;
  status: string;
}

const SEVERITY_CLASSES: Record<string, string> = {
  CRITICAL: 'text-critical bg-critical-soft',
  HIGH: 'text-warning bg-warning-soft',
  MEDIUM: 'text-info bg-info-soft',
  LOW: 'text-muted bg-surface',
};

export default function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const { data } = await mainApi.get('/api/proxy/api/v1/search', { params: { q: query, limit: 8 } });
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex-1 max-w-md flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-surface text-faint text-sm hover:border-border-strong transition-colors"
      >
        <Search size={14} strokeWidth={1.75} />
        <span className="flex-1 text-left">Search findings, repos, or logs…</span>
        <kbd className="hidden sm:inline-block font-mono text-[10px] px-1.5 py-0.5 rounded border border-border-strong text-faint">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4 animate-fade-in" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-xl bg-surface-raised border border-border-strong rounded-xl shadow-2xl overflow-hidden animate-fade-rise-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={16} className="text-faint shrink-0" strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search findings, repos, or logs…"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-faint"
          />
          <button onClick={() => setOpen(false)} className="text-faint hover:text-ink shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-muted">Searching…</div>
          ) : query && results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">No matches for &ldquo;{query}&rdquo;</div>
          ) : results.length > 0 ? (
            results.map((r) => (
              <button
                key={`${r.scanId}-${r.findingId}`}
                onClick={() => {
                  setOpen(false);
                  router.push(`/scanner/history?scanId=${encodeURIComponent(r.scanId)}`);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors text-left border-b border-border last:border-0"
              >
                <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center ${SEVERITY_CLASSES[r.severity] || SEVERITY_CLASSES.LOW}`}>
                  <ShieldAlert size={13} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-ink font-medium truncate">{r.title}</div>
                  <div className="text-[12px] text-muted truncate font-mono">
                    {r.repo} · {r.file}
                  </div>
                </div>
                <span className="font-mono text-[10px] uppercase text-faint shrink-0">{r.severity}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-faint">Type to search across every scanned repository.</div>
          )}
        </div>
      </div>
    </div>
  );
}
