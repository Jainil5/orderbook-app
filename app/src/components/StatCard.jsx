/** label + value card. Callers pass an already-formatted value (money() or a count). */
export default function StatCard({ label, value, delta, hint, points = false }) {
  const direction = !delta ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : null;
  return (
    <div className="card lift">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {delta !== null && delta !== undefined && (
        <div className={`delta ${direction}`}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {Math.abs(delta)}
          {points ? ' points vs previous' : '% vs previous period'}
        </div>
      )}
      {hint && <div className="delta">{hint}</div>}
    </div>
  );
}
