import { cn } from '../../lib/cn.js';

/** Literal so Tailwind can see every span; never build these class names at
 *  runtime. */
const SPAN = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-7',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  10: 'md:col-span-10',
  11: 'md:col-span-11',
  12: 'md:col-span-12',
};

/** Bento grid: 12 columns from `md` up, one stacked column below it. Pass a
 *  wider `className="lg:col-span-… xl:col-span-…"` pair when a card's content
 *  cannot survive the narrower mid-size columns.
 *  `glow` adds the Aceternity glare sweep layer over the card surface. */
export function BentoGrid({ className, children, gap = 'gap-4' }) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-12', gap, className)}>
      {children}
    </div>
  );
}

export function BentoCard({ span = 12, className, children, glow = true, ...props }) {
  return (
    <div
      className={cn('ob-bento-card ob-card min-w-0', SPAN[span], glow && 'ob-glare', className)}
      {...props}
    >
      {children}
      {glow ? <span className="ob-glare-layer" aria-hidden /> : null}
    </div>
  );
}
