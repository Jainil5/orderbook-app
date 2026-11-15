import { AlertTriangle, CheckCircle2, Info, WifiOff } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const TONES = {
  error: {
    wrap: 'border-rouge/35 bg-[color-mix(in_srgb,var(--ob-danger)_9%,var(--ob-surface))]',
    icon: 'text-rouge',
    Icon: AlertTriangle,
  },
  info: {
    wrap: 'border-gold/45 bg-[color-mix(in_srgb,var(--ob-accent)_11%,var(--ob-surface))]',
    icon: 'text-gold',
    Icon: Info,
  },
  success: {
    wrap: 'border-leaf/35 bg-[color-mix(in_srgb,var(--ob-success)_10%,var(--ob-surface))]',
    icon: 'text-leaf',
    Icon: CheckCircle2,
  },
  offline: {
    wrap: 'border-line-2 bg-surface-2',
    icon: 'text-muted',
    Icon: WifiOff,
  },
};

export function Alert({ tone = 'error', title, children, action, className }) {
  const t = TONES[tone] ?? TONES.error;
  const Icon = t.Icon;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-[var(--ob-radius-md)] border px-4 py-3 text-[0.84rem]',
        t.wrap,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-[1.05rem] shrink-0', t.icon)} aria-hidden />
      <div className="grow basis-[16rem]">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('leading-snug', title && 'mt-0.5', 'text-[var(--ob-text-secondary)]')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
