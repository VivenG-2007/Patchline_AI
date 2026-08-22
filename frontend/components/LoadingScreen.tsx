'use client';

import { useEffect, useRef, useState } from 'react';
import { Rocket } from 'lucide-react';

interface LoadingScreenProps {
  title?: string;
  subtitle?: string;
  /** Log-style lines revealed one by one as the bar crosses each line's threshold. */
  steps?: string[];
  /** Total time in ms to animate 0 -> 100%. */
  durationMs?: number;
  /** Called once the bar reaches 100%. */
  onComplete?: () => void;
}

const DEFAULT_STEPS = [
  'Initializing core systems…',
  'Loading environment configuration…',
  'Connecting to secure workspace…',
  'Resolving dependency graph…',
  'Running pre-flight checks…',
  'Almost there…',
];

export default function LoadingScreen({
  title = 'Setting things up…',
  subtitle = "Please hold tight while we configure your workspace. This shouldn't take long.",
  steps = DEFAULT_STEPS,
  durationMs = 2400,
  onComplete,
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  const visibleSteps = Math.max(1, Math.ceil((progress / 100) * steps.length));

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-accent-soft border border-accent/30 flex items-center justify-center mb-5">
            <Rocket size={22} className="text-accent-strong" strokeWidth={1.75} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
          <p className="text-muted text-sm mt-2 max-w-sm leading-relaxed">{subtitle}</p>
        </div>

        <div className="bg-terminal-bg rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-white/10">
            <span className="w-2.5 h-2.5 rounded-full bg-critical/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
            <span className="ml-2 text-[11px] font-mono text-terminal-muted">SYSTEM_INITIALIZATION</span>
          </div>
          <div className="px-4 py-4 space-y-1.5 min-h-[168px]">
            {steps.slice(0, visibleSteps).map((step, i) => {
              const isLast = i === visibleSteps - 1 && progress < 100;
              return (
                <div key={step} className="flex items-center gap-2 text-[12px] font-mono animate-fade-rise-in">
                  <span className="text-terminal-muted shrink-0">
                    [{String(i).padStart(2, '0')}:{String((i * 7) % 60).padStart(2, '0')}]
                  </span>
                  <span className="text-terminal-text flex-1">{step}</span>
                  <span className={isLast ? 'text-accent-strong' : 'text-success'}>
                    {isLast ? '···' : 'OK'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <div className="h-1.5 w-full rounded-full bg-surface-raised border border-border overflow-hidden">
            <div
              className="h-full rounded-full shimmer-bg transition-[width] duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-end mt-1.5">
            <span className="font-mono text-[11px] text-faint">{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
