type Tone = 'critical' | 'warning' | 'success' | 'info' | 'neutral';

interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

const tones: Record<Tone, string> = {
  critical: 'bg-critical-soft text-critical border-critical/25',
  warning: 'bg-warning-soft text-warning border-warning/25',
  success: 'bg-success-soft text-success border-success/25',
  info: 'bg-info-soft text-info border-info/25',
  neutral: 'bg-surface-raised text-muted border-border-strong',
};

const dotTones: Record<Tone, string> = {
  critical: 'bg-critical',
  warning: 'bg-warning',
  success: 'bg-success',
  info: 'bg-info',
  neutral: 'bg-faint',
};

export default function Badge({ tone = 'neutral', children, dot = false, pulse = false, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded border ${tones[tone]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotTones[tone]} ${pulse ? 'pulse-dot' : ''}`} />}
      {children}
    </span>
  );
}
