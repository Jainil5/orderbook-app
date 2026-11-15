import { cn } from '../../lib/cn.js';

/** Surface + header/content/footer slots. The slots own their own spacing so a
 *  heading can never sit on top of a table header the way the old .row did. */
export function Card({ className, children, as: Tag = 'div', ...props }) {
  return (
    <Tag className={cn('ob-card', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line px-5 py-4',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h2 className={cn('text-[1.05rem] leading-tight', className)} {...props}>
      {children}
    </h2>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-line bg-surface-2/60 px-5 py-3.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
