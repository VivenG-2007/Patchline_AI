import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-canvas hover:bg-accent-strong',
  secondary: 'bg-surface-raised text-ink border border-border-strong hover:border-accent',
  ghost: 'text-muted hover:text-ink hover:bg-surface-raised',
  danger: 'bg-critical-soft text-critical border border-critical/30 hover:bg-critical/10',
};

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2.5',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});

export default Button;
