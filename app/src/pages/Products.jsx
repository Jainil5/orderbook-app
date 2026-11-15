import { useState } from 'react';
import { Pencil, Plus, RotateCcw, Tag } from 'lucide-react';
import { api, money } from '../api.js';
import { useApi } from '../useApi.js';
import { Page, PageHeader } from '../components/ui/page.jsx';
import { Card, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Checkbox, Field, Input, Select } from '../components/ui/field.jsx';
import { Table, TBody, TD, TH, THead, TR, TableScroll } from '../components/ui/table.jsx';
import { SkeletonRows } from '../components/ui/skeleton.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';

const BLANK = { name: '', sku: '', category: 'General', price: 0, cost_price: 0, active: true };

export default function Products() {
  const { data, reload, error, loading } = useApi('/products');
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
    setSaved(null);
    setFailed(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    setEditing(null);
    setForm(BLANK);
    setSaved(null);
    setFailed(null);
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
    setFailed(null);
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
    <Page>
      <PageHeader
        title="Products"
        eyebrow={`${rows.length} in the catalog`}
        subtitle="Selling price and cost price drive every margin number in Insights."
      />

      <Card as="form" onSubmit={save} className="p-0">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="size-4 text-roast" aria-hidden />
            <CardTitle>{editing ? `Edit #${editing}` : 'Add a product'}</CardTitle>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="size-3.5" aria-hidden />
                Cancel
              </Button>
            ) : null}
            <Button type="submit" size="sm">
              <Plus className="size-3.5" aria-hidden />
              {editing ? 'Save changes' : 'Add product'}
            </Button>
          </div>
        </CardHeader>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field label="Name" htmlFor="product_name" className="sm:col-span-2 xl:col-span-2">
            <Input id="product_name" name="product_name" placeholder="Filter coffee" value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="SKU" htmlFor="product_sku">
            <Input id="product_sku" name="product_sku" placeholder="CF-250" value={form.sku ?? ''} onChange={set('sku')} />
          </Field>
          <Field label="Category" htmlFor="product_category">
            <Select id="product_category" name="product_category" value={form.category} onChange={set('category')}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Selling price" htmlFor="product_price">
            <Input id="product_price" name="product_price" type="number" step="0.01" min="0" placeholder="0.00" value={form.price} onChange={set('price')} required />
          </Field>
          <Field label="Cost price" htmlFor="product_cost">
            <Input id="product_cost" name="product_cost" type="number" step="0.01" min="0" placeholder="0.00" value={form.cost_price} onChange={set('cost_price')} required />
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox name="product_active" label="Active" checked={!!form.active} onChange={set('active')} />
          </div>
        </div>
        {saved ? <div className="px-5 pb-4"><Alert tone="success">{saved}</Alert></div> : null}
        {failed ? <div className="px-5 pb-4"><Alert tone="error" title="Could not save">{failed}</Alert></div> : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <span className="text-[0.78rem] text-muted">Margin is (price − cost) ÷ price</span>
        </CardHeader>
        {error ? (
          <div className="p-5"><Alert tone="error" title="Could not load products">{error}</Alert></div>
        ) : loading ? (
          <div className="p-5"><SkeletonRows rows={8} /></div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Tag} title="No products yet" description="Add your first product above to start selling." />
          </div>
        ) : (
          <TableScroll maxHeight="calc(100vh - 340px)">
            <Table minWidth={760}>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Category</TH>
                  <TH num>Price</TH>
                  <TH num>Cost</TH>
                  <TH num>Margin</TH>
                  <TH>Status</TH>
                  <TH num>Action</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((p) => {
                  const margin = p.price > 0 ? ((p.price - p.cost_price) / p.price) * 100 : 0;
                  return (
                    <TR key={p.id} className={p.active ? '' : 'opacity-55'}>
                      <TD>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-[0.75rem] uppercase tracking-[0.08em] text-muted">
                          {p.sku ?? 'no sku'}
                        </div>
                      </TD>
                      <TD className="text-muted">{p.category}</TD>
                      <TD num>{money(p.price)}</TD>
                      <TD num className="text-muted">{money(p.cost_price)}</TD>
                      <TD num>
                        <div className="flex items-center justify-end gap-2">
                          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-line/80">
                            <span
                              className="ob-grow-bar block h-full rounded-full"
                              style={{
                                width: `${Math.max(Math.min(margin, 100), 0)}%`,
                                background: margin <= 0 ? 'var(--ob-danger)' : 'var(--ob-gradient-primary)',
                              }}
                            />
                          </span>
                          <span className={margin <= 0 ? 'font-semibold text-rouge tabular-nums' : 'tabular-nums'}>
                            {margin.toFixed(1)}%
                          </span>
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={p.active ? 'success' : 'neutral'} dot>
                          {p.active ? 'active' : 'inactive'}
                        </Badge>
                      </TD>
                      <TD num>
                        <div className="flex justify-end gap-1.5">
                          <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(p)}>
                            <Pencil className="size-3.5" aria-hidden />
                            Edit
                          </Button>
                          {p.active ? (
                            <Button type="button" variant="ghost" size="sm" onClick={() => deactivate(p)}>
                              Disable
                            </Button>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableScroll>
        )}
      </Card>
    </Page>
  );
}
