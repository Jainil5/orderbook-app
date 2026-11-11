export default function Bars({ rows, label, format, empty = 'Nothing to show for this period.' }) {
  if (!rows?.length) return <div className="empty">{empty}</div>;
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  return (
    <div>
      {label && <h3 style={{ marginBottom: 10 }}>{label}</h3>}
      <div className="bars">
        {rows.map((r, i) => (
          <div className="bar-row" key={`${r.label}-${i}`}>
            <div>
              <div>{r.label}</div>
              {r.sub && <span className="stat-label">{r.sub}</span>}
              <div className="bar-track" style={{ marginTop: 4 }}>
                <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </div>
            <div className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
              {format ? format(r.value) : r.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
