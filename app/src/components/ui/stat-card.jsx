import { cn } from '../../lib/cn.js';
import { useTilt } from '../effects/card-glow.jsx';
import { NumberTicker } from '../effects/number-ticker.jsx';

const TONE_TEXT = {
  up: 'text-leaf',
  down: 'text-rouge',
  neutral: 'text-muted',
};

function Sparkline({ points }) {
  const W = 200;
  const H = 34;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const d = points
    .map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(H - ((v - min) / span) * (H - 4) - 2).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 h-[34px] w-full text-roast"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={`${d} L${W},${H} L0,${H} Z`} className="fill-roast/10" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** KPI tile: accent rail that widens on hover, rolling value, delta and hint.
 *  `value` is the already-formatted string (fallback + a11y label); pass
 *  `numericValue` to get the odometer roll. */
export function StatCard({
  label,
  value,
  numericValue,
  format,
  delta,
  points = false,
  hint,
  spark,
  className,
}) {
  const direction = delta === null || delta === undefined ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
  const tilt = useTilt();

  return (
    <div
      {...tilt}
      className={cn('ob-card ob-tilt group relative overflow-hidden p-4', className)}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-roast to-gold transition-all duration-300 group-hover:w-1.5"
        aria-hidden
      />
      <div className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="ob-num mt-2 text-[1.65rem]">
        {numericValue === undefined || numericValue === null ? (
          value
        ) : (
          <NumberTicker value={numericValue} format={format}>{value}</NumberTicker>
        )}
      </div>
      {spark && spark.length > 1 ? <Sparkline points={spark} /> : null}
      {direction ? (
        <div className={cn('mt-2 text-[0.78rem] font-medium', TONE_TEXT[direction])}>
          {direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■'}{' '}
          {Math.abs(Number(delta.toFixed ? delta.toFixed(1) : delta))}
          {points ? ' pts vs previous' : '% vs previous'}
        </div>
      ) : null}
      {hint ? <div className="mt-1.5 text-[0.78rem] text-muted">{hint}</div> : null}
    </div>
  );
}
