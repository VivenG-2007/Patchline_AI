'use client';

import { BrainCircuit, Loader2, Check } from 'lucide-react';

type SimilarPastFix = {
  similarity: number;
  title?: string;
  category?: string;
  severity?: string;
  file?: string;
  fixSummary?: string;
  verified: boolean;
};

interface RagMemoryTraceProps {
  /** Whether the backend has RAG memory switched on at all (RAG_MEMORY_ENABLED
   *  + a configured Chroma Cloud collection) — comes from the scan result's
   *  `ragMemoryEnabled` flag. If false, this renders nothing: there's no
   *  pipeline running to show a trace for. */
  ragMemoryEnabled: boolean;
  /** In-flight fix phase for this finding, or null once it's settled. */
  phase: 'FIX_QUEUED' | 'FIX_PROCESSING' | null;
  /** Set once the fix call returns (verified or needs-review). */
  settled: boolean;
  similarPastFixes?: SimilarPastFix[];
}

/**
 * Traces the two RAG memory steps that happen during a single finding's fix,
 * alongside the "Indexed" step that already happened at scan time:
 *
 *   1. Recall  — memory_store.retrieve_similar() ran before the fix prompt
 *      was built, searching this account's past fixes for prior art.
 *   2. Remember — memory_store.record_fix_outcome() ran after verification,
 *      so this fix (verified or needs-review) becomes retrievable prior art
 *      for the next similar finding.
 *
 * Both are best-effort on the backend (never block or fail a fix), so this
 * is purely descriptive — it never blocks the fix UI or implies failure.
 */
export default function RagMemoryTrace({ ragMemoryEnabled, phase, settled, similarPastFixes }: RagMemoryTraceProps) {
  if (!ragMemoryEnabled) return null;

  const recalling = phase === 'FIX_QUEUED' || phase === 'FIX_PROCESSING';
  const hasSimilar = (similarPastFixes?.length ?? 0) > 0;

  // Nothing to show yet — fix hasn't been approved for this finding.
  if (!recalling && !settled) return null;

  return (
    <div className="text-xs rounded border border-border bg-surface-raised px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-faint uppercase tracking-wide">
        <BrainCircuit size={12} />
        RAG memory
      </div>

      {/* Step: Recall */}
      <div className="flex items-start gap-2">
        {recalling ? (
          <Loader2 size={12} className="animate-spin mt-0.5 shrink-0 text-accent-strong" />
        ) : (
          <Check size={12} className="mt-0.5 shrink-0 text-success" />
        )}
        <div className="flex-1 min-w-0">
          {recalling ? (
            <span className="text-muted">Searching past fixes for similar findings…</span>
          ) : hasSimilar ? (
            <div className="space-y-1.5">
              <span className="text-ink">
                Recalled {similarPastFixes!.length} similar past {similarPastFixes!.length === 1 ? 'fix' : 'fixes'} — used as prior art:
              </span>
              <ul className="space-y-1">
                {similarPastFixes!.map((item, i) => (
                  <li key={i} className="pl-3 border-l border-border-strong text-muted">
                    <span className="font-mono text-[10px] text-accent-strong">{Math.round(item.similarity * 100)}% match</span>{' '}
                    <span className={item.verified ? 'text-success' : 'text-warning'}>
                      {item.verified ? 'verified fix' : 'attempted, needs review'}
                    </span>{' '}
                    — &ldquo;{item.title}&rdquo;{item.file ? ` in ${item.file}` : ''}
                    {item.fixSummary && <div className="text-[11px] text-faint">{item.fixSummary}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <span className="text-muted">No similar past fixes found — first time seeing this pattern.</span>
          )}
        </div>
      </div>

      {/* Step: Remember — only relevant once the fix has settled */}
      {settled && (
        <div className="flex items-center gap-2">
          <Check size={12} className="shrink-0 text-success" />
          <span className="text-muted">Outcome recorded to memory as prior art for future fixes.</span>
        </div>
      )}
    </div>
  );
}
