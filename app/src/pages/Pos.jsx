import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { useApi } from '../useApi.js';

export default function Pos() {
  const catalog = useApi('/products');
  const people = useApi('/customers');
  const meta = useApi('/settings');

  const [cart, setCart] = useState({});
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [channel, setChannel] = useState('counter');
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState('upi');
  const [fullyPaid, setFullyPaid] = useState(true);
  const [partial, setPartial] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [placed, setPlaced] = useState(null);

  const taxPercent = meta.data?.tax_percent ?? 0;
  const byId = useMemo(() => Object.fromEntries((catalog.data ?? []).map((p) => [p.id, p])), [catalog.data]);

  const shown = (catalog.data ?? []).filter((p) => p.active)
    .filter((p) => category === 'All' || p.category === category)
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const lines = Object.entries(cart).map(([id, qty]) => ({ product: byId[id], qty })).filter((l) => l.product);
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const discountAmt = subtotal * (Number(discount) || 0) / 100;
  const taxAmt = (subtotal - discountAmt) * taxPercent / 100;
  const total = subtotal - discountAmt + taxAmt;

  const bump = (id, delta) => setCart((c) => {
    const next = { ...c };
    const qty = (next[id] ?? 0) + delta;
    if (qty <= 0) delete next[id]; else next[id] = qty;
    return next;
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const order = await api.post('/orders', {
        items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
        customer_id: customerId ? Number(customerId) : null,
        channel,
        discount_percent: Number(discount) || 0,
        payment_method: method,
        paid_amount: fullyPaid ? null : Number(partial),
        note: note || null,
      });
      setPlaced(order);
      setCart({});
      setNote('');
      setDiscount(0);
      setPartial(0);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addCustomer = async () => {
    if (!newCustomer.name.trim()) return;
    const created = await api.post('/customers', newCustomer);
    setCustomerId(String(created.id));
    setNewCustomer({ name: '', phone: '' });
    people.reload();
  };

  if (placed) {
    return (
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="stat-label">Order placed</div>
        <h1 style={{ margin: '8px 0' }}>{placed.order_no}</h1>
        <div className="totals">
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(placed.subtotal)}</span></div>
          {placed.discount > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Discount</span><span>−{money(placed.discount)}</span></div>}
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Tax ({taxPercent}%)</span><span>{money(placed.tax)}</span></div>
          <div className="row grand" style={{ justifyContent: 'space-between' }}><span>Total</span><span>{money(placed.total)}</span></div>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={() => setPlaced(null)}>Next order</button>
          <Link className="btn" to={`/orders/${placed.id}`}>Open order</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div><h1>New order</h1><div className="page-sub">Tap products to build the cart. Totals are recalculated by the API on submit.</div></div>
      </div>

      <div className="split">
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="grow" name="search" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {['All', ...(meta.data?.categories ?? [])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="tiles">
            {shown.map((p) => (
              <button className="tile" key={p.id} onClick={() => bump(p.id, 1)}>
                <div>
                  <div className="cat">{p.category}</div>
                  <div className="name">{p.name}</div>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="price">{money(p.price)}</span>
                  {cart[p.id] && <span className="badge confirmed">{cart[p.id]} in cart</span>}
                </div>
              </button>
            ))}
          </div>
          {!shown.length && <div className="empty">No products match.</div>}
        </div>

        <div className="card">
          <h2>Cart</h2>
          {lines.length === 0 && <div className="empty">Nothing added yet.</div>}
          {lines.map((l) => (
            <div className="cart-line" key={l.product.id}>
              <div>
                <div>{l.product.name}</div>
                <span className="stat-label">{money(l.product.price)} each</span>
              </div>
              <div className="qty">
                <button onClick={() => bump(l.product.id, -1)}>−</button>
                <span>{l.qty}</span>
                <button onClick={() => bump(l.product.id, 1)}>+</button>
              </div>
              <strong>{money(l.product.price * l.qty)}</strong>
            </div>
          ))}

          <div className="col" style={{ marginTop: 14 }}>
            <label>Customer</label>
            <select name="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Walk-in</option>
              {(people.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!customerId && (
              <div className="row">
                <input className="grow" name="new_customer_name" placeholder="New customer name" value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                <input style={{ width: 120 }} name="new_customer_phone" placeholder="Phone" value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                <button className="btn small" onClick={addCustomer}>Add</button>
              </div>
            )}

            <label>Channel</label>
            <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {(meta.data?.channels ?? ['counter']).map((c) => <option key={c}>{c}</option>)}
            </select>

            <div className="row">
              <div className="col grow">
                <label>Discount %</label>
                <input type="number" name="discount_percent" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div className="col grow">
                <label>Payment</label>
                <select name="payment_method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {(meta.data?.payment_methods ?? ['cash']).map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" name="fully_paid" style={{ minHeight: 0, width: 18 }} checked={fullyPaid}
                onChange={(e) => setFullyPaid(e.target.checked)} />
              Paid in full
            </label>
            {!fullyPaid && (
              <input type="number" name="amount_received" min="0" step="0.01" placeholder="Amount received" value={partial}
                onChange={(e) => setPartial(e.target.value)} />
            )}
            <textarea name="note" rows="2" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="totals" style={{ marginTop: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(subtotal)}</span></div>
            {discountAmt > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Discount</span><span>−{money(discountAmt)}</span></div>}
            <div className="row" style={{ justifyContent: 'space-between' }}><span>Tax {taxPercent}%</span><span>{money(taxAmt)}</span></div>
            <div className="row grand" style={{ justifyContent: 'space-between' }}><span>Total</span><span>{money(total)}</span></div>
            {!fullyPaid && <div className="row" style={{ justifyContent: 'space-between' }}><span>Balance due</span><span>{money(Math.max(total - Number(partial || 0), 0))}</span></div>}
          </div>

          {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
          <button className="btn primary" style={{ width: '100%', marginTop: 12 }}
            disabled={!lines.length || busy} onClick={submit}>
            {busy ? 'Saving…' : `Place order · ${money(total)}`}
          </button>
        </div>
      </div>
    </>
  );
}
