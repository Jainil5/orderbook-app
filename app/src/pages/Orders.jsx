import { useState } from 'react';
import { Link } from 'react-router-dom';
import { day, money, timeOf } from '../api.js';
import { useApi } from '../useApi.js';

export default function Orders({ status }) {
  const people = useApi('/customers');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(status ?? 'All');

  const query = new URLSearchParams({ limit: '200' });
  if (filter !== 'All') query.set('status', filter);
  if (search.trim()) query.set('q', search.trim());
  const { data, error, loading } = useApi(`/orders?${query}`);

  const statuses = ['All', 'open', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  const rows = data ?? [];
  const due = rows.reduce((s, o) => s + Math.max(o.total - o.paid_amount, 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <div className="page-sub">
            {loading ? 'Loading…' : `${rows.length} orders · ${money(due)} unpaid in this view`}
          </div>
        </div>
        <div className="row">
          <input className="grow" name="order_search" placeholder="Search order no or customer" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <Link className="btn primary" to="/pos">New order</Link>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        {statuses.map((s) => (
          <button key={s} className={`btn small ${filter === s ? 'primary' : 'ghost'}`} onClick={() => setFilter(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="card">
        {error && <div className="error">{error}</div>}
        <table>
          <thead>
            <tr>
              <th>Order</th><th>When</th><th>Customer</th><th>Channel</th>
              <th className="num">Units</th><th className="num">Total</th>
              <th className="num">Balance</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/orders/${o.id}`}>{o.order_no}</Link></td>
                <td>{day(o.created_at)} · {timeOf(o.created_at)}</td>
                <td>{o.customer_name ?? <span className="stat-label">walk-in</span>}</td>
                <td>{o.channel}</td>
                <td className="num">{o.units ?? 0}</td>
                <td className="num">{money(o.total)}</td>
                <td className="num" style={{ color: o.outstanding > 0 ? 'var(--red)' : undefined }}>
                  {money(o.outstanding)}
                </td>
                <td><span className={`badge ${o.status}`}>{o.status}</span></td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={8}><div className="empty">No orders match this filter.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="meta">Payments recorded against {people.data?.length ?? 0} saved customers.</div>
    </>
  );
}
