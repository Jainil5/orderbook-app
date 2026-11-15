import { cn } from '../../lib/cn.js';

/* The tone classes have to be built at runtime from a token name, which is
   exactly what Tailwind's scanner cannot see — so the tint is written as an
   inline style instead of a generated class. */
const TONE_TOKENS = {
  success: '--ob-success',
  warning: '--ob-warning',
  roast: '--ob-primary',
  gold: '--ob-accent',
  danger: '--ob-danger',
};

const tint = (token) => ({
  color: `var(${token})`,
  backgroundColor: `color-mix(in srgb, var(${token}) 16%, transparent)`,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(${token}) 34%, transparent)`,
});

const TONES = {
  neutral: 'bg-surface-2 text-[var(--ob-text-secondary)] ring-1 ring-inset ring-line',
};

export function Badge({ children, tone = 'neutral', dot = false, className }) {
  const token = TONE_TOKENS[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold capitalize whitespace-nowrap',
        token ? 'ring-0' : TONES[tone] ?? TONES.neutral,
        className,
      )}
      style={token ? tint(token) : undefined}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </span>
  );
}

/** Order status is the one vocabulary the whole app shares. */
const STATUS_TONES = {
  open: 'warning',
  confirmed: 'gold',
  preparing: 'roast',
  ready: 'success',
  delivered: 'neutral',
  cancelled: 'danger',
  active: 'success',
  inactive: 'neutral',
};

export function StatusBadge({ status, className }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot className={className}>
      {status}
    </Badge>
  );
}
