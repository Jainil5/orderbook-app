import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, ReceiptText } from 'lucide-react';
import { money } from '../api.js';
import { useApi } from '../useApi.js';
import { Page, PageHeader } from '../components/ui/page.jsx';
import { StatCard } from '../components/ui/stat-card.jsx';
import { BentoCard, BentoGrid } from '../components/ui/bento.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { ButtonLink } from '../components/ui/button.jsx';
import { StatusBadge } from '../components/ui/badge.jsx';
import { Table, TBody, TD, TH, THead, TR, TableScroll } from '../components/ui/table.jsx';
import { SkeletonRows, SkeletonStats } from '../components/ui/skeleton.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';
import { Trend, TrendFooter } from '../components/charts/trend.jsx';

export default function Dashboard() {
  const { data, error } = useApi('/dashboard');
  const range = useApi('/insights?days=14');

  if (error) {
    return (
      <Alert tone="error" title="Could not load today">
        {error}
      </Alert>
    );
  }

  const header = (
    <PageHeader
      eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      title="Today"
      subtitle="Live figures from the orders on this machine. Nothing here is a forecast."
      actions={
        <>
          <ButtonLink to="/insights" variant="secondary">Trends</ButtonLink>
          <ButtonLink to="/pos">
            <ArrowUpRight className="size-4" aria-hidden />
            Take an order
          </ButtonLink>
        </>
      }
    />
  );

  if (!data) {
    return (
      <Page>
        {header}
        <SkeletonStats count={4} />
        <SkeletonRows rows={5} />
      </Page>
    );
  }

  const t = data.today;
  const spark = (range.data?.daily ?? []).map((d) => d.revenue);

  return (
    <Page>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={money(t.revenue)}
          numericValue={t.revenue}
          format={money}
          hint={`${t.orders} ${t.orders === 1 ? 'order' : 'orders'} · ${t.units} units`}
          spark={spark}
        />
        <StatCard
          label="Average order"
          value={money(t.aov)}
          numericValue={t.aov}
          format={money}
          hint={`${t.avg_lines_per_order} lines per order`}
        />
        <StatCard
          label="Gross profit"
          value={money(t.gross_profit)}
          numericValue={t.gross_profit}
          format={money}
          hint={`${t.margin_pct}% margin`}
        />
        <StatCard
          label="To collect"
          value={money(t.outstanding)}
          numericValue={t.outstanding}
          format={money}
          hint={`${money(t.discounts)} discounted today`}
        />
      </div>

      {data.below_cost_products.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-[1.05rem] shrink-0 text-rouge" aria-hidden />
              <div>
                <CardTitle>Priced at or below cost</CardTitle>
                <p className="mt-1 text-[0.8rem] leading-snug text-muted">
                  These sell at zero or negative margin. Fix the cost price or the selling price.
                </p>
              </div>
            </div>
            <ButtonLink to="/products" variant="secondary" size="sm">Edit catalog</ButtonLink>
          </CardHeader>
          <TableScroll>
            <Table minWidth={460}>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Category</TH>
                  <TH num>Selling price</TH>
                  <TH num>Cost price</TH>
                </TR>
              </THead>
              <TBody>
                {data.below_cost_products.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link className="text-leaf underline-offset-4 hover:underline" to="/products">
                        {p.name}
                      </Link>
                    </TD>
                    <TD className="text-muted">{p.category}</TD>
                    <TD num>{money(p.price)}</TD>
                    <TD num className="text-rouge">{money(p.cost_price)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        </Card>
      ) : null}

      <BentoGrid>
        <BentoCard span={7} className="overflow-hidden p-0">
          <CardHeader>
            <div>
              <CardTitle>Open orders</CardTitle>
              <p className="mt-1 text-[0.8rem] text-muted">
                {data.open_orders.length} still in the pipeline
              </p>
            </div>
            <ButtonLink to="/orders" variant="ghost" size="sm">All orders</ButtonLink>
          </CardHeader>
          {data.open_orders.length === 0 ? (
            <CardContent>
              <EmptyState
                icon={ReceiptText}
                title="Pipeline is clear"
                description="Everything raised so far has been delivered."
              />
            </CardContent>
          ) : (
            <TableScroll maxHeight="360px">
              <Table minWidth={430}>
                <THead>
                  <TR>
                    <TH>Order</TH>
                    <TH num>Total</TH>
                    <TH num>Due</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.open_orders.map((o) => {
                    const due = Math.max(o.total - o.paid_amount, 0);
                    return (
                      <TR key={o.id}>
                        <TD>
                          <Link
                            className="font-semibold text-leaf underline-offset-4 hover:underline"
                            to={`/orders/${o.id}`}
                          >
                            {o.order_no}
                          </Link>
                        </TD>
                        <TD num>{money(o.total)}</TD>
                        <TD num className={due > 0 ? 'text-rouge' : 'text-muted'}>{money(due)}</TD>
                        <TD><StatusBadge status={o.status} /></TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableScroll>
          )}
        </BentoCard>

        <BentoCard span={5} className="p-0">
          <CardHeader>
            <CardTitle>Last 14 days</CardTitle>
            {range.data ? (
              <span className="text-[0.8rem] font-semibold tabular-nums text-ink">
                {money(range.data.totals.revenue)}
              </span>
            ) : null}
          </CardHeader>
          <CardContent>
            {range.data ? (
              <>
                <Trend data={range.data.daily} height={168} />
                <TrendFooter data={range.data.daily} />
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-[var(--ob-radius-md)] bg-surface-2/80 p-3">
                  <div>
                    <dt className="text-[0.66rem] uppercase tracking-[0.11em] text-muted">Revenue</dt>
                    <dd className="mt-0.5 font-display text-[1.05rem]">{money(range.data.totals.revenue)}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.66rem] uppercase tracking-[0.11em] text-muted">Margin</dt>
                    <dd className="mt-0.5 font-display text-[1.05rem]">{range.data.totals.margin_pct}%</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="py-10 text-center text-[0.84rem] text-muted">Loading trend…</div>
            )}
          </CardContent>
          <div className="border-t border-line px-5 py-3.5">
            <ButtonLink to="/insights" variant="secondary" size="sm">Open insights</ButtonLink>
          </div>
        </BentoCard>
      </BentoGrid>
    </Page>
  );
}
