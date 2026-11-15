import { cn } from '../../lib/cn.js';

/** Page shell for every route: one place that owns vertical rhythm so pages no
 *  longer hand-space each card with inline marginTop. */
export function Page({ children, className }) {
  return (
    <div className={cn('relative flex flex-col gap-4 pb-4', className)}>
      <div className="ob-stagger flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow, className }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-1',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-roast">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="truncate text-[1.55rem] leading-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 max-w-3xl text-[0.84rem] leading-snug text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
