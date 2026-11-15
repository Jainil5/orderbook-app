import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ReceiptText, Search } from 'lucide-react';
import { day, money, timeOf } from '../api.js';
import { useApi } from '../useApi.js';
import { Page, PageHeader } from '../components/ui/page.jsx';
import { Card } from '../components/ui/card.jsx';
import { ButtonLink } from '../components/ui/button.jsx';
import { StatusBadge } from '../components/ui/badge.jsx';
import { Input } from '../components/ui/field.jsx';
import { SegmentedControl } from '../components/ui/segmented.jsx';
import { Table, TBody, TD, TH, THead, TR, TableScroll } from '../components/ui/table.jsx';
import { SkeletonRows } from '../components/ui/skeleton.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';

/* Open first, because that is the list a counter works from; All is the
   escape hatch right beside it. */
const STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'All', label: 'All' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

export default function Orders({ status }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState(status ?? 'open');
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 220);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams({ limit: '200' });
  if (filter !== 'All') query.set('status', filter);
  if (debounced) query.set('q', debounced);

  const { data, error, loading } = useApi(`/orders?${query}`);
  const rows = data ?? [];
  const due = rows.reduce((s, o) => s + Math.max(o.outstanding ?? o.total - o.paid_amount, 0), 0);

  return (
    <Page>
      <PageHeader
        title="Orders"
        eyebrow={loading ? 'Loading…' : `${rows.length} orders · ${money(due)} unpaid in this view`}
        subtitle="Every row links to the full order, including payments and status history."
        actions={
          <>
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                name="order_search"
                placeholder="Order no or customer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                style={{ width: 220 }}
              />
            </span>
            <ButtonLink to="/pos">
              <ArrowUpRight className="size-4" aria-hidden />
              New order
            </ButtonLink>
          </>
        }
      />

      <SegmentedControl
        label="Filter by status"
        value={filter}
        onChange={setFilter}
        options={STATUSES}
        className="self-start"
      />

      {error ? <Alert tone="error" title="Could not load orders">{error}</Alert> : null}

      <Card className="overflow-hidden p-0">
        {loading && !rows.length ? (
          <div className="p-5"><SkeletonRows rows={8} /></div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={ReceiptText}
              title="No orders match this filter"
              description="Clear the search box or pick another status."
              action={<ButtonLink to="/pos" size="sm">Take an order</ButtonLink>}
            />
          </div>
        ) : (
          <TableScroll maxHeight="calc(100vh - 300px)">
            <Table minWidth={760}>
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>When</TH>
                  <TH>Customer</TH>
                  <TH num>Units</TH>
                  <TH num>Total</TH>
                  <TH num>Balance</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((o) => {
                  const balance = Math.max(o.outstanding ?? o.total - o.paid_amount, 0);
                  return (
                    <TR
                      key={o.id}
                      onClick={() => navigate(`/orders/${o.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/orders/${o.id}`); }}
                      className="cursor-pointer"
                    >
                      <TD>
                        <Link
                          to={`/orders/${o.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-leaf underline-offset-4 hover:underline"
                        >
                          {o.order_no}
                        </Link>
                      </TD>
                      <TD className="text-muted">
                        <div>{day(o.created_at)}</div>
                        <div className="text-[0.75rem] opacity-80">{timeOf(o.created_at)}</div>
                      </TD>
                      <TD>
                        <div className="font-medium">{o.customer_name ?? 'Walk-in'}</div>
                        <div className="text-[0.72rem] uppercase tracking-[0.1em] text-muted">
                          {o.channel}
                        </div>
                      </TD>
                      <TD num>{o.units ?? 0}</TD>
                      <TD num>{money(o.total)}</TD>
                      <TD num className={balance > 0 ? 'font-semibold text-rouge' : 'text-muted'}>
                        {money(balance)}
                      </TD>
                      <TD><StatusBadge status={o.status} /></TD>
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
