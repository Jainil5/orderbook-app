import { useState } from 'react';
import Bars from '../components/Bars.jsx';
import StatCard from '../components/StatCard.jsx';
import Trend from '../components/Trend.jsx';
import { api, money } from '../api.js';
import { useApi } from '../useApi.js';

const RANGES = [7, 30, 90];

/** The model writes "Heading:" lines; promote those to bold and keep bullets. */
function SummaryText({ text }) {
  return (
    <div className="summary">
      {text.split('\n').filter(Boolean).map((line, i) => {
        const match = line.match(/^[\s-]*(Performance|Margins? and mix)\s*:\s*(.*)$/i);
        if (match) {
          return (
            <p key={i} style={{ marginTop: i ? 14 : 0 }}>
              <strong>{match[1]}</strong> {match[2]}
            </p>
          );
        }
        return <p key={i} style={{ margin: '4px 0' }}>{line}</p>;
      })}
    </div>
  );
}

export default function Insights() {
  const [days, setDays] = useState(30);
  const { data, error } = useApi(`/insights?days=${days}`);
  const [summary, setSummary] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [thinking, setThinking] = useState(false);

  const generate = async () => {
    setThinking(true);
    setAiError(null);
    try {
      setSummary(await api.post(`/insights/summary?days=${days}`));
    } catch (e) {
      setAiError(e.message);
      setSummary(null);
    } finally {
      setThinking(false);
    }
  };

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="empty">Computing analytics…</div>;

  const t = data.totals;
  const c = data.change;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <div className="page-sub">
            {data.range.from} to {data.range.to} against {data.range.prev_from} to {data.range.prev_to}
          </div>
        </div>
        <div className="row">
          {RANGES.map((r) => (
            <button key={r} className={`btn small ${days === r ? 'primary' : 'ghost'}`} onClick={() => { setDays(r); setSummary(null); }}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid cols-4">
        <StatCard label="Revenue" value={money(t.revenue)} delta={c.revenue_pct} />
        <StatCard label="Orders" value={t.orders} delta={c.orders_pct} hint={`${t.units} units sold`} />
        <StatCard label="Average order" value={money(t.aov)} delta={c.aov_pct} />
        <StatCard label="Gross margin" value={`${t.margin_pct}%`} delta={c.margin_pts} points />
      </div>

      <div className="grid cols-4" style={{ marginTop: 14 }}>
        <StatCard label="Gross profit" value={money(t.gross_profit)} hint={`${money(t.tax)} tax collected`} />
        <StatCard label="Discounted" value={money(t.discounts)} hint={`${t.cancelled} cancelled orders`} />
        <StatCard label="To collect" value={money(t.outstanding)} hint={`${t.avg_lines_per_order} lines per order`} />
        <StatCard label="Walk-in revenue" value={money(data.walkins.revenue)} hint={`${data.walkins.orders} counter orders`} />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Revenue by day</h2>
        <Trend data={data.daily} />
      </div>

      <div className="grid cols-3" style={{ marginTop: 14 }}>
        <div className="card">
          <Bars label="Top products" rows={data.top_products.map((r) => ({ label: r.product, value: r.revenue, sub: `${r.units} units · ${money(r.profit)} profit` }))} format={money} />
        </div>
        <div className="card">
          <Bars label="Revenue by category" rows={data.categories.map((r) => ({ label: r.category, value: r.revenue, sub: `${r.units} units` }))} format={money} />
        </div>
        <div className="card">
          <Bars label="Weekday pattern" rows={data.weekday.map((r) => ({ label: r.day, value: r.revenue, sub: `${r.orders} orders` }))} format={money} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Lowest margin at real volume</h2>
        <div className="page-sub">Ranked by margin, filtered to products with at least 3 units sold. These are where discounting hurts most.</div>
        <table>
          <thead><tr><th>Product</th><th className="num">Units</th><th className="num">Revenue</th><th className="num">Profit</th><th className="num">Margin</th></tr></thead>
          <tbody>
            {data.low_margin_products.map((r) => (
              <tr key={r.product}>
                <td>{r.product}</td>
                <td className="num">{r.units}</td>
                <td className="num">{money(r.revenue)}</td>
                <td className="num">{money(r.profit)}</td>
                <td className="num" style={{ color: r.margin_pct < 50 ? 'var(--red)' : undefined }}>{r.margin_pct}%</td>
              </tr>
            ))}
            {!data.low_margin_products.length && <tr><td colSpan={5}><div className="empty">No products with three or more units sold.</div></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid cols-3" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Order pipeline</h3>
          <table>
            <thead><tr><th>Status</th><th className="num">Orders</th><th className="num">Value</th></tr></thead>
            <tbody>
              {data.statuses.map((s) => (
                <tr key={s.status}><td><span className={`badge ${s.status}`}>{s.status}</span></td><td className="num">{s.orders}</td><td className="num">{money(s.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Payment mix</h3>
          <table>
            <thead><tr><th>Method</th><th className="num">Orders</th><th className="num">Collected</th></tr></thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.payment_method}><td>{p.payment_method}</td><td className="num">{p.orders}</td><td className="num">{money(p.collected)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Best customers</h3>
          <table>
            <thead><tr><th>Customer</th><th className="num">Orders</th><th className="num">Revenue</th></tr></thead>
            <tbody>
              {data.top_customers.map((r) => (
                <tr key={r.customer}><td>{r.customer}</td><td className="num">{r.orders}</td><td className="num">{money(r.revenue)}</td></tr>
              ))}
              {!data.top_customers.length && <tr><td colSpan={3}><div className="empty">None in range.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>AI summary</h2>
            <div className="page-sub">
              Every figure above is computed in SQL. The model only reads those figures and writes the prose.
            </div>
          </div>
          <button className="btn primary" onClick={generate} disabled={thinking}>
            {thinking ? 'Thinking…' : summary ? 'Regenerate' : 'Generate summary'}
          </button>
        </div>

        {thinking && <div className="empty" style={{ marginTop: 12 }}>Reading {money(t.revenue)} across {t.orders} orders…</div>}
        {aiError && (
          <div className="error" style={{ marginTop: 12 }}>
            {aiError} — the numbers above are unaffected. Retry when Ollama is reachable.
          </div>
        )}
        {summary && (
          <>
            <div style={{ marginTop: 12 }}><SummaryText text={summary.summary} /></div>
            <div className="meta">model {summary.model} · generated {summary.generated_at.replace('T', ' ')}</div>
          </>
        )}
      </div>
    </>
  );
}
