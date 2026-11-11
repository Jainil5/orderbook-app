import { money } from '../api.js';

/** Revenue sparkline over the daily series. viewBox scales, stroke width does not. */
export default function Trend({ data, height = 150 }) {
  if (!data?.length) return <div className="empty">No orders in this range.</div>;
  const W = 600;
  const H = height;
  const pad = 8;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const step = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => [
    pad + i * step,
    H - pad - (d.revenue / max) * (H - pad * 2),
  ]);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points.at(-1)[0].toFixed(1)},${H - pad} L${points[0][0].toFixed(1)},${H - pad} Z`;

  return (
    <div>
      <svg className="trend" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <path className="area" d={area} />
        <path className="line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--muted)' }}>
        <span>{data[0].day}</span>
        <span>peak {money(max)}</span>
        <span>{data.at(-1).day}</span>
      </div>
    </div>
  );
}
