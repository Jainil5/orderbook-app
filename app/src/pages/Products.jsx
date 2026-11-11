import { useState } from 'react';
import { api, money } from '../api.js';
import { useApi } from '../useApi.js';

const BLANK = { name: '', sku: '', category: 'General', price: 0, cost_price: 0, active: true };

export default function Products() {
  const { data, reload, error } = useApi('/products');
  const meta = useApi('/settings');
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [saved, setSaved] = useState(null);
  const [failed, setFailed] = useState(null);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const startEdit = (p) => {
    setEditing(p.id);
    setForm({ ...p, active: !!p.active });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaved(null);
    setFailed(null);
    const body = {
      ...form,
      price: Number(form.price),
      cost_price: Number(form.cost_price),
      category: form.category || 'General',
      sku: form.sku || null,
    };
    try {
      if (editing) await api.put(`/products/${editing}`, body);
      else await api.post('/products', body);
      setSaved(editing ? 'Product updated.' : 'Product added.');
      setForm(BLANK);
      setEditing(null);
      reload();
    } catch (e) {
      setFailed(e.message);
    }
  };

  const deactivate = async (p) => {
    try {
      await api.del(`/products/${p.id}`);
      reload();
    } catch (e) {
      setFailed(e.message);
    }
  };

  const rows = data ?? [];
  // 'General' is the default for new products, so it must be selectable even when
  // no product uses it yet — otherwise the dropdown shows a different value than we submit.
  const categories = Array.from(new Set([...(meta.data?.categories ?? []), 'General']));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <div className="page-sub">Selling price and cost price drive every margin number in Insights.</div>
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <h2>{editing ? `Edit #${editing}` : 'Add a product'}</h2>
        <div className="row" style={{ marginTop: 10 }}>
          <input className="grow" name="product_name" placeholder="Name" value={form.name} onChange={set('name')} required />
          <input style={{ width: 120 }} name="product_sku" placeholder="SKU" value={form.sku ?? ''} onChange={set('sku')} />
          <select style={{ width: 150 }} name="product_category" value={form.category} onChange={set('category')}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input style={{ width: 110 }} name="product_price" type="number" step="0.01" min="0" placeholder="Price" value={form.price} onChange={set('price')} required />
          <input style={{ width: 110 }} name="product_cost" type="number" step="0.01" min="0" placeholder="Cost" value={form.cost_price} onChange={set('cost_price')} required />
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" name="product_active" style={{ minHeight: 0, width: 18 }} checked={!!form.active} onChange={set('active')} />
            Active
          </label>
          <button className="btn primary" type="submit">{editing ? 'Save changes' : 'Add product'}</button>
          {editing && <button className="btn ghost" type="button" onClick={() => { setEditing(null); setForm(BLANK); }}>Cancel</button>}
        </div>
        {saved && <div className="notice" style={{ marginTop: 10 }}>{saved}</div>}
        {failed && <div className="error" style={{ marginTop: 10 }}>{failed}</div>}
      </form>

      <div className="card" style={{ marginTop: 14 }}>
        {error && <div className="error">{error}</div>}
        <table>
          <thead>
            <tr>
              <th>Product</th><th>SKU</th><th>Category</th>
              <th className="num">Price</th><th className="num">Cost</th>
              <th className="num">Margin</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const margin = p.price > 0 ? ((p.price - p.cost_price) / p.price) * 100 : 0;
              return (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td>{p.name}</td>
                  <td>{p.sku ?? '—'}</td>
                  <td>{p.category}</td>
                  <td className="num">{money(p.price)}</td>
                  <td className="num">{money(p.cost_price)}</td>
                  <td className="num" style={{ color: margin <= 0 ? 'var(--red)' : undefined }}>{margin.toFixed(1)}%</td>
                  <td>{p.active ? <span className="badge ready">active</span> : <span className="badge cancelled">inactive</span>}</td>
                  <td className="num">
                    <div className="row end">
                      <button className="btn small" onClick={() => startEdit(p)}>Edit</button>
                      {!!p.active && <button className="btn small ghost" onClick={() => deactivate(p)}>Disable</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8}><div className="empty">No products yet.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
