import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 active:scale-[0.98]';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-cyan text-white hover:bg-accent-cyan-strong shadow-sm',
  secondary: 'bg-bg-subtle text-text-primary border border-border-default hover:border-border-hover hover:bg-bg-card-raised',
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-bg-subtle',
  danger: 'bg-accent-rose-soft text-accent-rose border border-accent-rose/30 hover:bg-accent-rose/20',
  success: 'bg-accent-emerald text-white hover:bg-accent-emerald-strong shadow-sm',
};

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5 font-mono',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-5 py-2.5',
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
