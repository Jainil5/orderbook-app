import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, day, money } from '../api.js';
import { useApi } from '../useApi.js';

export default function Customers() {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [failed, setFailed] = useState(null);

  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  const { data, reload, error } = useApi(`/customers${query}`);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let live = true;
    api.get(`/customers/${selected}`).then((d) => live && setDetail(d)).catch((e) => live && setFailed(e.message));
    return () => { live = false; };
  }, [selected]);

  const add = async (event) => {
    event.preventDefault();
    setFailed(null);
    try {
      await api.post('/customers', { ...form, name: form.name.trim() });
      setForm({ name: '', phone: '', email: '' });
      reload();
    } catch (e) {
      setFailed(e.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <div className="page-sub">Counter walk-ins stay unlinked, which is why walk-in revenue is tracked separately in Insights.</div>
        </div>
        <input className="grow" name="customer_search" style={{ maxWidth: 260 }} placeholder="Search name or phone"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <form className="card" onSubmit={add}>
        <h2>Add a customer</h2>
        <div className="row" style={{ marginTop: 10 }}>
          <input className="grow" name="customer_name" placeholder="Name" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input style={{ width: 160 }} name="customer_phone" placeholder="Phone" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input style={{ width: 220 }} name="customer_email" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <button className="btn primary" type="submit">Save</button>
        </div>
        {failed && <div className="error" style={{ marginTop: 10 }}>{failed}</div>}
      </form>

      <div className="split" style={{ marginTop: 14 }}>
        <div className="card">
          {error && <div className="error">{error}</div>}
          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th className="num">Orders</th><th className="num">Revenue</th><th>Last order</th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((c) => (
                <tr key={c.id} onClick={() => setSelected(c.id)}
                  style={{ cursor: 'pointer', background: selected === c.id ? '#fbf3e6' : undefined }}>
                  <td>{c.name}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td className="num">{c.orders}</td>
                  <td className="num">{money(c.revenue)}</td>
                  <td>{c.last_order_at ? day(c.last_order_at) : '—'}</td>
                </tr>
              ))}
              {!data?.length && <tr><td colSpan={5}><div className="empty">No customers match.</div></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          {!detail && <div className="empty">Pick a customer to see their orders.</div>}
          {detail && (
            <>
              <h2>{detail.name}</h2>
              <div className="page-sub">{[detail.phone, detail.email].filter(Boolean).join(' · ')}</div>
              <div className="grid cols-3" style={{ gap: 10, margin: '14px 0' }}>
                <div><div className="stat-label">Orders</div><strong>{detail.stats.orders}</strong></div>
                <div><div className="stat-label">Revenue</div><strong>{money(detail.stats.revenue)}</strong></div>
                <div><div className="stat-label">Owes</div><strong style={{ color: detail.stats.outstanding > 0 ? 'var(--red)' : undefined }}>
                  {money(detail.stats.outstanding)}
                </strong></div>
              </div>
              <table>
                <thead><tr><th>Order</th><th>When</th><th className="num">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {detail.orders.map((o) => (
                    <tr key={o.id}>
                      <td><Link to={`/orders/${o.id}`}>{o.order_no}</Link></td>
                      <td>{day(o.created_at)}</td>
                      <td className="num">{money(o.total)}</td>
                      <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </>
  );
}
