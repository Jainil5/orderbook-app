import { cn } from '../../lib/cn.js';

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-[var(--ob-radius-lg)] border border-dashed border-line-2 bg-surface-2/50 px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && <Icon className="mb-1 size-5 text-muted" aria-hidden />}
      <p className="font-display text-[1.02rem]">{title}</p>
      {description && (
        <p className="max-w-md text-[0.82rem] leading-snug text-muted">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
