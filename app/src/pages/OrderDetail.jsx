import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, day, money, timeOf } from '../api.js';
import { useApi } from '../useApi.js';

const FLOW = ['open', 'confirmed', 'preparing', 'ready', 'delivered'];

export default function OrderDetail() {
  const { id } = useParams();
  const { data: order, error, loading, setData } = useApi(`/orders/${id}`);
  const meta = useApi('/settings');
  const [payment, setPayment] = useState('');
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    if (meta.data && !method) setMethod(meta.data.payment_methods?.[0] ?? 'cash');
  }, [meta.data, method]);

  const patch = async (body) => {
    setBusy(true);
    setFailed(null);
    try {
      setData(await api.patch(`/orders/${id}`, body));
    } catch (e) {
      setFailed(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="empty">Loading order…</div>;
  if (error) return <div className="error">{error}</div>;
  if (!order) return null;

  const index = FLOW.indexOf(order.status);
  const next = index >= 0 && index < FLOW.length - 1 ? FLOW[index + 1] : null;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/orders" className="page-sub">← All orders</Link>
          <h1>{order.order_no}</h1>
          <div className="page-sub">
            {day(order.created_at)} · {timeOf(order.created_at)} · {order.channel}
            {' · '}{order.customer_name ?? 'walk-in'}
          </div>
        </div>
        <span className={`badge ${order.status}`} style={{ fontSize: '0.85rem' }}>{order.status}</span>
      </div>

      {failed && <div className="error" style={{ marginBottom: 12 }}>{failed}</div>}

      <div className="split">
        <div className="card">
          <h2>Items</h2>
          <table>
            <thead>
              <tr><th>Product</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Line total</th></tr>
            </thead>
            <tbody>
              {order.items.map((line) => (
                <tr key={line.id}>
                  <td>{line.name}</td>
                  <td className="num">{line.qty}</td>
                  <td className="num">{money(line.unit_price)}</td>
                  <td className="num">{money(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals" style={{ marginTop: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
            {order.discount > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Discount</span><span>−{money(order.discount)}</span></div>}
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Tax</span><span>{money(order.tax)}</span></div>
            <div className="row grand" style={{ justifyContent: 'space-between' }}><span>Total</span><span>{money(order.total)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Paid · {order.payment_method}</span><span>{money(order.paid_amount)}</span></div>
            <div className="row" style={{ justifyContent: 'space-between', color: order.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>
              <span>Balance</span><span>{money(order.outstanding)}</span>
            </div>
          </div>
          {order.note && <div className="notice" style={{ marginTop: 12 }}>{order.note}</div>}
        </div>

        <div>
          <div className="card">
            <h3>Status</h3>
            <div className="col" style={{ marginTop: 10 }}>
              {order.status === 'cancelled'
                ? <div className="notice">Cancelled. Create a new order to replace it.</div>
                : (
                  <div className="row">
                    {FLOW.map((s, i) => (
                      <span key={s} className={`badge ${s}`} style={{ opacity: i <= index ? 1 : 0.35 }}>{s}</span>
                    ))}
                  </div>
                )}
              {next && (
                <button className="btn primary" disabled={busy} onClick={() => patch({ status: next })}>
                  Mark {next}
                </button>
              )}
              {order.status !== 'cancelled' && order.status !== 'delivered' && (
                <button className="btn ghost" disabled={busy} onClick={() => patch({ status: 'cancelled' })}>
                  Cancel order
                </button>
              )}
              {order.status === 'delivered' && order.outstanding > 0 && (
                <div className="page-sub">Delivered with {money(order.outstanding)} still owed.</div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <h3>Payment</h3>
            <div className="col" style={{ marginTop: 10 }}>
              <label>Total paid (rupees)</label>
              <input type="number" name="paid_amount" step="0.01" min="0" value={payment} placeholder={String(order.paid_amount)}
                onChange={(e) => setPayment(e.target.value)} />
              <select name="payment_method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {(meta.data?.payment_methods ?? ['cash']).map((m) => <option key={m}>{m}</option>)}
              </select>
              <div className="row">
                <button className="btn small" disabled={busy} onClick={() => patch({ paid_amount: order.total })}>
                  Mark fully paid
                </button>
                <button className="btn primary grow" disabled={busy || payment === ''}
                  onClick={() => patch({ paid_amount: Number(payment), payment_method: method })}>
                  Save payment
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
