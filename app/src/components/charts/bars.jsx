import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/cn.js';

const SERIES = [
  'linear-gradient(90deg, var(--color-roast), var(--color-gold))',
  'linear-gradient(90deg, var(--color-roast-deep), var(--color-roast))',
  'linear-gradient(90deg, var(--color-gold-deep), var(--color-gold))',
];

/** Horizontal ranking bars. Rows arrive pre-sorted, so the first entry reads as
 *  the leader without hunting for the longest bar. */
export function Bars({ rows, format = (v) => v, empty, className }) {
  const reduceMotion = useReducedMotion();

  if (!rows?.length) {
    return (
      <div className={cn('py-6 text-center text-[0.84rem] text-muted', className)}>
        {empty ?? 'Nothing to show for this period.'}
      </div>
    );
  }

  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);

  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {rows.map((r, i) => {
        const pct = Math.max(((Number(r.value) || 0) / max) * 100, 1.5);
        return (
          <li key={`${r.label}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <div className="min-w-0">
              <div className="truncate text-[0.84rem] font-medium">{r.label}</div>
              {r.sub ? <div className="truncate text-[0.72rem] text-muted">{r.sub}</div> : null}
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line/70">
                <motion.div
                  className="h-full rounded-full origin-left"
                  style={{ width: `${pct}%`, background: r.color ?? SERIES[i % SERIES.length] }}
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.65, delay: 0.05 + i * 0.045, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
            <div className="whitespace-nowrap text-right text-[0.8rem] font-semibold tabular-nums text-ink">
              {format(r.value)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
