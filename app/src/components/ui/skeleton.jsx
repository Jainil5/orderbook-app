import { cn } from '../../lib/cn.js';

function Skeleton({ className }) {
  return <div className={cn('ob-skeleton', className)} aria-hidden />;
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="ob-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-32" />
          <Skeleton className="mt-3 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 6, className }) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
