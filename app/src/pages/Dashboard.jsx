import { Link } from 'react-router-dom';
import StatCard from '../components/StatCard.jsx';
import Trend from '../components/Trend.jsx';
import { money, timeOf } from '../api.js';
import { useApi } from '../useApi.js';

export default function Dashboard() {
  const { data, error } = useApi('/dashboard');
  const range = useApi('/insights?days=14');

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="empty">Loading today…</div>;

  const t = data.today;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <div className="page-sub">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <Link className="btn primary" to="/pos">Take an order</Link>
      </div>

      <div className="grid cols-4">
        <StatCard label="Revenue" value={money(t.revenue)} hint={`${t.orders} orders`} />
        <StatCard label="Average order" value={money(t.aov)} hint={`${t.units} units sold`} />
        <StatCard label="Gross profit" value={money(t.gross_profit)} hint={`${t.margin_pct}% margin`} />
        <StatCard label="To collect" value={money(t.outstanding)} hint={`${money(t.discounts)} discounted`} />
      </div>

      {data.below_cost_products.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Priced at or below cost</h2>
          <div className="page-sub">These sell at zero or negative margin. Fix the cost price or the selling price.</div>
          <table>
            <thead><tr><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">Cost</th></tr></thead>
            <tbody>
              {data.below_cost_products.map((p) => (
                <tr key={p.id}>
                  <td><Link to="/products">{p.name}</Link></td>
                  <td>{p.category}</td>
                  <td className="num">{money(p.price)}</td>
                  <td className="num">{money(p.cost_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="split" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Open orders</h2>
            <Link className="btn small ghost" to="/orders">All orders</Link>
          </div>
          {data.open_orders.length === 0
            ? <div className="empty">Nothing in the pipeline. Everything is delivered.</div>
            : (
              <table>
                <thead><tr><th>Order</th><th>Placed</th><th className="num">Total</th><th className="num">Due</th><th>Status</th></tr></thead>
                <tbody>
                  {data.open_orders.map((o) => (
                    <tr key={o.id}>
                      <td><Link to={`/orders/${o.id}`}>{o.order_no}</Link></td>
                      <td>{timeOf(o.created_at)}</td>
                      <td className="num">{money(o.total)}</td>
                      <td className="num">{money(Math.max(o.total - o.paid_amount, 0))}</td>
                      <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        <div className="card">
          <h2>Last 14 days</h2>
          {range.data ? <Trend data={range.data.daily} /> : <div className="empty">Loading…</div>}
          {range.data && (
            <div className="totals" style={{ marginTop: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Revenue</span><strong>{money(range.data.totals.revenue)}</strong>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Margin</span><strong>{range.data.totals.margin_pct}%</strong>
              </div>
            </div>
          )}
          <Link className="btn small" to="/insights" style={{ marginTop: 12 }}>Open insights</Link>
        </div>
      </div>
    </>
  );
}
