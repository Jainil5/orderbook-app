import { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { money } from '../../api.js';
import { cn } from '../../lib/cn.js';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Light cubic smoothing; keeps every real data point on the curve. */
function curve(points) {
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const c = (x1 - x0) * 0.22;
    d += ` C${(x0 + c).toFixed(1)},${y0.toFixed(1)} ${(x1 - c).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

export function Trend({ data, height = 180, format = money, className }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const reduceMotion = useReducedMotion();
  const rawId = useId();
  const gradientId = `ob-trend${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  if (!data?.length) {
    return <div className="py-8 text-center text-[0.84rem] text-muted">No orders in this range.</div>;
  }

  const pad = { l: 8, r: 8, t: 14, b: 14 };
  const innerW = Math.max(width - pad.l - pad.r, 1);
  const innerH = height - pad.t - pad.b;
  const max = Math.max(...data.map((d) => Number(d.revenue) || 0), 1);
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => [
    pad.l + i * step,
    pad.t + innerH - (Math.max(Number(d.revenue) || 0, 0) / max) * innerH,
  ]);
  const line = curve(points);
  const area = `${line} L${points.at(-1)[0].toFixed(1)},${(pad.t + innerH).toFixed(1)} L${points[0][0].toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`;
  const active = hover === null ? null : data[hover];

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left - pad.l;
    const index = Math.round(x / (step || 1));
    setHover(Math.min(Math.max(index, 0), data.length - 1));
  };

  return (
    <div ref={ref} className={cn('relative', className)} style={{ height }}>
      <svg
        width={width || '100%'}
        height={height}
        role="img"
        aria-label={`Revenue by day, peak ${money(max)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-roast)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-roast)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={pad.l}
            x2={pad.l + innerW}
            y1={pad.t + innerH * f}
            y2={pad.t + innerH * f}
            stroke="var(--color-line)"
            strokeDasharray="3 5"
          />
        ))}

        <motion.path
          d={area}
          fill={`url(#${gradientId})`}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.15 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke="var(--color-roast)"
          strokeWidth="2.25"
          strokeLinecap="round"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />

        {active ? (
          <g>
            <line
              x1={points[hover][0]}
              x2={points[hover][0]}
              y1={pad.t - 6}
              y2={pad.t + innerH}
              stroke="var(--color-gold-deep)"
              strokeDasharray="2 4"
            />
            <circle cx={points[hover][0]} cy={points[hover][1]} r="5" fill="var(--color-surface)" stroke="var(--color-roast-deep)" strokeWidth="2.25" />
          </g>
        ) : null}
      </svg>

      {active ? (
        <div
          className="ob-card pointer-events-none absolute z-10 -translate-x-1/2 px-2.5 py-1.5 text-[0.74rem] leading-tight"
          style={{
            left: Math.min(Math.max(points[hover][0], 60), (width || 120) - 60),
            top: Math.max(points[hover][1] - 52, 0),
          }}
        >
          <div className="font-semibold tabular-nums">{money(active.revenue)}</div>
          <div className="text-muted">
            {active.day} · {active.orders} {active.orders === 1 ? 'order' : 'orders'}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TrendFooter({ data }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map((d) => Number(d.revenue) || 0));
  const peak = data.find((d) => Number(d.revenue) === max);
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-muted">
      <span>{data[0].day}</span>
      {peak ? <span className="font-medium text-leaf">peak {money(peak.revenue)} · {peak.day}</span> : null}
      <span>{data.at(-1).day}</span>
    </div>
  );
}
