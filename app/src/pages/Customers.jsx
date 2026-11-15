import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Plus, Users } from 'lucide-react';
import { api, day, money } from '../api.js';
import { useApi } from '../useApi.js';
import { Page, PageHeader } from '../components/ui/page.jsx';
import { BentoCard, BentoGrid } from '../components/ui/bento.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Field, Input } from '../components/ui/field.jsx';
import { Table, TBody, TD, TH, THead, TR, TableScroll } from '../components/ui/table.jsx';
import { StatusBadge } from '../components/ui/badge.jsx';
import { SkeletonRows } from '../components/ui/skeleton.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';
import { digitsOf, phoneOk } from '../lib/phone.js';

export default function Customers() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 220);
    return () => clearTimeout(timer);
  }, [search]);

  const query = debounced ? `?q=${encodeURIComponent(debounced)}` : '';
  const { data, reload, error, loading } = useApi(`/customers${query}`);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return undefined;
    }
    let live = true;
    api.get(`/customers/${selected}`)
      .then((d) => { if (live) setDetail(d); })
      .catch((e) => { if (live) setFailed(e.message); });
    return () => { live = false; };
  }, [selected]);

  const add = async (event) => {
    event.preventDefault();
    setFailed(null);
    try {
      await api.post('/customers', {
        phone: digitsOf(form.phone),
        name: form.name.trim() || null,
        email: form.email.trim() || null,
      });
      setForm({ name: '', phone: '', email: '' });
      reload();
    } catch (e) {
      setFailed(e.message);
    }
  };

  const rows = data ?? [];

  return (
    <Page>
      <PageHeader
        title="Customers"
        eyebrow={loading ? 'Loading…' : `${rows.length} shown`}
        subtitle="Every account is keyed on a mobile number; the name is optional. Orders placed without one stay walk-ins, which is why walk-in revenue is tracked separately in Insights."
        actions={
          <Input
            name="customer_search"
            placeholder="Search name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search customers"
            style={{ width: 240 }}
          />
        }
      />

      <Card as="form" onSubmit={add} className="p-0">
        <CardHeader>
          <CardTitle>Add a customer</CardTitle>
          <Button type="submit" size="sm" disabled={!phoneOk(form.phone)}>
            <Plus className="size-3.5" aria-hidden />
            Save
          </Button>
        </CardHeader>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <Field label="Mobile number" htmlFor="customer_phone" hint="Compulsory. This is what finds the account at the counter.">
            <Input id="customer_phone" name="customer_phone" type="tel" inputMode="numeric" placeholder="7 to 15 digits"
              required value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Name (optional)" htmlFor="customer_name" hint="With no name, the number is the label.">
            <Input id="customer_name" name="customer_name" placeholder="Full name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="customer_email">
            <Input id="customer_email" name="customer_email" type="email" placeholder="Optional" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        {failed ? <div className="px-5 pb-4"><Alert tone="error" title="Could not save">{failed}</Alert></div> : null}
      </Card>

      {error ? <Alert tone="error" title="Could not load customers">{error}</Alert> : null}

      <BentoGrid>
        <BentoCard span={7} className="overflow-hidden p-0">
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <span className="text-[0.78rem] text-muted">Pick a row to see orders</span>
          </CardHeader>
          {loading && !rows.length ? (
            <div className="p-5"><SkeletonRows rows={7} /></div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Users} title="No customers match" description="Clear the search or add an account above." />
            </div>
          ) : (
            <TableScroll maxHeight="calc(100vh - 380px)">
              <Table minWidth={460}>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH num>Orders</TH>
                    <TH num>Revenue</TH>
                    <TH>Last order</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((c) => (
                    <TR
                      key={c.id}
                      onClick={() => setSelected(c.id)}
                      className={selected === c.id ? 'bg-roast/8' : 'cursor-pointer'}
                    >
                      <TD>
                        <div className="font-medium">{c.display}</div>
                        {c.name ? <div className="text-[0.75rem] text-muted">{c.phone}</div> : null}
                      </TD>
                      <TD num>{c.orders}</TD>
                      <TD num className="font-semibold tabular-nums text-ink">{money(c.revenue)}</TD>
                      <TD className="text-muted">{c.last_order_at ? day(c.last_order_at) : '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          )}
        </BentoCard>

        <BentoCard span={5} className="p-0">
          <CardHeader>
            <CardTitle>{detail ? detail.display : 'Customer detail'}</CardTitle>
            {detail ? (
              <span className="flex items-center gap-3 text-[0.76rem] text-muted">
                {detail.phone ? <span className="inline-flex items-center gap-1"><Phone className="size-3.5" aria-hidden />{detail.phone}</span> : null}
                {detail.email ? <span className="inline-flex items-center gap-1"><Mail className="size-3.5" aria-hidden />{detail.email}</span> : null}
              </span>
            ) : null}
          </CardHeader>
          {!detail ? (
            <CardContent>
              <EmptyState
                icon={Users}
                title="Nothing selected"
                description="Choose a customer on the left to see their order history and what they still owe."
              />
            </CardContent>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 px-5 py-4">
                {[
                  { label: 'Orders', value: detail.stats.orders },
                  { label: 'Revenue', value: money(detail.stats.revenue) },
                  { label: 'Owes', value: money(detail.stats.outstanding), danger: detail.stats.outstanding > 0 },
                ].map((s) => (
                  <div key={s.label} className="rounded-[var(--ob-radius-md)] bg-surface-2/80 px-3 py-2.5">
                    <div className="text-[0.64rem] uppercase tracking-[0.11em] text-muted">{s.label}</div>
                    <div className={`mt-1 font-display text-[1.05rem] ${s.danger ? 'text-rouge' : ''}`}>{s.value}</div>
                  </div>
                ))}
              </div>
              <TableScroll maxHeight="300px">
                <Table minWidth={340}>
                  <THead>
                    <TR>
                      <TH>Order</TH>
                      <TH>When</TH>
                      <TH num>Total</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {detail.orders.map((o) => (
                      <TR key={o.id}>
                        <TD>
                          <Link className="font-semibold text-leaf underline-offset-4 hover:underline" to={`/orders/${o.id}`}>
                            {o.order_no}
                          </Link>
                        </TD>
                        <TD className="whitespace-nowrap text-muted">{day(o.created_at)}</TD>
                        <TD num>{money(o.total)}</TD>
                        <TD><StatusBadge status={o.status} /></TD>
                      </TR>
                    ))}
                    {!detail.orders.length ? (
                      <TR><TD colSpan={4} className="py-6 text-center text-muted">No orders yet.</TD></TR>
                    ) : null}
                  </TBody>
                </Table>
              </TableScroll>
            </>
          )}
        </BentoCard>
      </BentoGrid>
    </Page>
  );
}
