import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';

const BASE =
  'ob-press inline-flex items-center justify-center gap-2 rounded-[var(--ob-radius-md)] font-semibold whitespace-nowrap disabled:pointer-events-none disabled:opacity-50';

const VARIANTS = {
  primary: 'ob-btn-primary px-4 py-2.5 text-sm',
  secondary:
    'border border-line bg-surface px-4 py-2.5 text-sm text-ink hover:border-line-2 hover:bg-surface-2',
  gold: 'border border-gold/55 bg-gold/12 px-4 py-2.5 text-sm text-gold hover:bg-gold/22',
  ghost: 'px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'border border-rouge/45 bg-rouge/12 px-4 py-2.5 text-sm text-rouge hover:bg-rouge/20',
};

const SIZES = {
  sm: 'min-h-9 px-3 py-1 text-xs pointer-coarse:min-h-11',
  md: 'min-h-11',
  icon: 'min-h-11 min-w-11 p-0',
};

/** Shared class string so a router Link can wear the button chrome. */
const buttonStyles = ({ variant = 'primary', size = 'md', className } = {}) =>
  cn(BASE, VARIANTS[variant], SIZES[size], className);

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonStyles({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'primary', size = 'md', className, ...props }) {
  return <Link className={buttonStyles({ variant, size, className })} {...props} />;
}
