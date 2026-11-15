import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { api, money } from '../api.js';
import { useApi } from '../useApi.js';
import { Page, PageHeader } from '../components/ui/page.jsx';
import { StatCard } from '../components/ui/stat-card.jsx';
import { BentoCard, BentoGrid } from '../components/ui/bento.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge, StatusBadge } from '../components/ui/badge.jsx';
import { SegmentedControl } from '../components/ui/segmented.jsx';
import { Table, TBody, TD, TH, THead, TR, TableScroll } from '../components/ui/table.jsx';
import { SkeletonStats } from '../components/ui/skeleton.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { Bars } from '../components/charts/bars.jsx';
import { Trend, TrendFooter } from '../components/charts/trend.jsx';

const RANGES = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
];

/** The model writes "Heading:" lines; promote those to bold and keep bullets. */
function SummaryText({ text }) {
  return (
    <div className="flex flex-col gap-3 text-[0.9rem] leading-[1.6]">
      {text.split('\n').filter(Boolean).map((line, i) => {
        const match = line.match(/^[\s-]*(Performance|Margins? and mix)\s*:\s*(.*)$/i);
        if (match) {
          return (
            <p key={i}>
              <strong className="font-display text-[0.98rem] text-leaf">{match[1]}:</strong>{' '}
              {match[2]}
            </p>
          );
        }
        return <p key={i} className="text-[var(--ob-text-secondary)]">{line}</p>;
      })}
    </div>
  );
}

export default function Insights() {
  const [days, setDays] = useState(30);
  const { data, error } = useApi(`/insights?days=${days}`);
  const [summary, setSummary] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [thinking, setThinking] = useState(false);
  const reduceMotion = useReducedMotion();

  const changeRange = (next) => {
    setDays(next);
    setSummary(null);
  };

  const generate = async () => {
    setThinking(true);
    setAiError(null);
    try {
      setSummary(await api.post(`/insights/summary?days=${days}`));
    } catch (e) {
      setAiError(e.message);
      setSummary(null);
    } finally {
      setThinking(false);
    }
  };

  if (error) return <Alert tone="error" title="Could not compute analytics">{error}</Alert>;

  const header = (
    <PageHeader
      title="Insights"
      eyebrow={data ? `${data.range.from} → ${data.range.to}` : 'Loading…'}
      subtitle={
        data
          ? `Compared against the previous equal window: ${data.range.prev_from} → ${data.range.prev_to}.`
          : undefined
      }
      actions={
        <SegmentedControl label="Range" value={days} onChange={changeRange} options={RANGES} />
      }
    />
  );

  if (!data) {
    return (
      <Page>
        {header}
        <SkeletonStats count={4} />
        <SkeletonStats count={4} />
      </Page>
    );
  }

  const t = data.totals;
  const c = data.change;

  return (
    <Page>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={money(t.revenue)} numericValue={t.revenue} format={money} delta={c.revenue_pct} />
        <StatCard label="Orders" value={String(t.orders)} numericValue={t.orders} delta={c.orders_pct} hint={`${t.units} units sold`} />
        <StatCard label="Average order" value={money(t.aov)} numericValue={t.aov} format={money} delta={c.aov_pct} />
        <StatCard label="Gross margin" value={`${t.margin_pct}%`} numericValue={t.margin_pct} format={(v) => `${v.toFixed(1)}%`} delta={c.margin_pts} points />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross profit" value={money(t.gross_profit)} hint={`${money(t.tax)} tax collected`} />
        <StatCard label="Discounted" value={money(t.discounts)} hint={`${t.cancelled} cancelled orders`} />
        <StatCard label="To collect" value={money(t.outstanding)} hint={`${t.avg_lines_per_order} lines per order`} />
        <StatCard label="Walk-in revenue" value={money(data.walkins.revenue)} hint={`${data.walkins.orders} counter orders`} />
      </div>

      <BentoCard span={12} className="p-0">
        <CardHeader>
          <div>
            <CardTitle>Revenue by day</CardTitle>
            <p className="mt-1 text-[0.8rem] text-muted">Hover the line for a day-by-day read.</p>
          </div>
          <Badge tone="roast">{money(t.revenue)}</Badge>
        </CardHeader>
        <CardContent>
          <Trend data={data.daily} height={220} />
          <TrendFooter data={data.daily} />
        </CardContent>
      </BentoCard>

      <BentoGrid>
        <BentoCard span={4}>
          <CardHeader className="border-b-0 px-0 pt-0">
            <CardTitle>Top products</CardTitle>
          </CardHeader>
          <Bars
            rows={data.top_products.map((r) => ({
              label: r.product,
              value: r.revenue,
              sub: `${r.units} units · ${money(r.profit)} profit`,
            }))}
            format={money}
          />
        </BentoCard>
        <BentoCard span={4}>
          <CardHeader className="border-b-0 px-0 pt-0">
            <CardTitle>Revenue by category</CardTitle>
          </CardHeader>
          <Bars
            rows={data.categories.map((r) => ({ label: r.category, value: r.revenue, sub: `${r.units} units` }))}
            format={money}
          />
        </BentoCard>
        <BentoCard span={4}>
          <CardHeader className="border-b-0 px-0 pt-0">
            <CardTitle>Weekday pattern</CardTitle>
          </CardHeader>
          <Bars
            rows={data.weekday.map((r) => ({ label: r.day, value: r.revenue, sub: `${r.orders} orders` }))}
            format={money}
          />
        </BentoCard>
      </BentoGrid>

      <BentoCard span={12} className="overflow-hidden p-0">
        <CardHeader>
          <div>
            <CardTitle>Lowest margin at real volume</CardTitle>
            <p className="mt-1 text-[0.8rem] text-muted">
              Ranked by margin, filtered to products with at least 3 units sold — this is where discounting hurts most.
            </p>
          </div>
        </CardHeader>
        <TableScroll>
          <Table minWidth={560}>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH num>Units</TH>
                <TH num>Revenue</TH>
                <TH num>Profit</TH>
                <TH num>Margin</TH>
              </TR>
            </THead>
            <TBody>
              {data.low_margin_products.map((r) => (
                <TR key={r.product}>
                  <TD className="font-medium">{r.product}</TD>
                  <TD num>{r.units}</TD>
                  <TD num>{money(r.revenue)}</TD>
                  <TD num>{money(r.profit)}</TD>
                  <TD num className={r.margin_pct < 50 ? 'font-semibold text-rouge' : 'tabular-nums'}>
                    {r.margin_pct}%
                  </TD>
                </TR>
              ))}
              {!data.low_margin_products.length ? (
                <TR>
                  <TD colSpan={5} className="py-6 text-center text-muted">
                    No products with three or more units sold.
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </TableScroll>
      </BentoCard>

      <BentoGrid>
        <BentoCard span={6} className="xl:col-span-4 p-0">
          <CardHeader><CardTitle>Order pipeline</CardTitle></CardHeader>
          <TableScroll>
            <Table minWidth={260}>
              <THead>
                <TR><TH>Status</TH><TH num>Orders</TH><TH num>Value</TH></TR>
              </THead>
              <TBody>
                {data.statuses.map((s) => (
                  <TR key={s.status}>
                    <TD><StatusBadge status={s.status} /></TD>
                    <TD num>{s.orders}</TD>
                    <TD num>{money(s.value)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        </BentoCard>

        <BentoCard span={6} className="xl:col-span-4 p-0">
          <CardHeader><CardTitle>Payment mix</CardTitle></CardHeader>
          <TableScroll>
            <Table minWidth={260}>
              <THead>
                <TR><TH>Method</TH><TH num>Orders</TH><TH num>Collected</TH></TR>
              </THead>
              <TBody>
                {data.payments.map((p) => (
                  <TR key={p.payment_method}>
                    <TD className="capitalize">{p.payment_method}</TD>
                    <TD num>{p.orders}</TD>
                    <TD num>{money(p.collected)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        </BentoCard>

        <BentoCard span={12} className="xl:col-span-4 p-0">
          <CardHeader><CardTitle>Best customers</CardTitle></CardHeader>
          <TableScroll>
            <Table minWidth={260}>
              <THead>
                <TR><TH>Customer</TH><TH num>Orders</TH><TH num>Revenue</TH></TR>
              </THead>
              <TBody>
                {data.top_customers.map((r) => (
                  <TR key={r.customer}>
                    <TD className="font-medium">{r.customer}</TD>
                    <TD num>{r.orders}</TD>
                    <TD num>{money(r.revenue)}</TD>
                  </TR>
                ))}
                {!data.top_customers.length ? (
                  <TR><TD colSpan={3} className="py-6 text-center text-muted">None in range.</TD></TR>
                ) : null}
              </TBody>
            </Table>
          </TableScroll>
        </BentoCard>
      </BentoGrid>

      <Card className="relative overflow-hidden">
        <div className="ob-grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <CardHeader className="relative border-b-0">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-roast" aria-hidden />
              <CardTitle>AI summary</CardTitle>
            </div>
            <p className="mt-1.5 max-w-2xl text-[0.8rem] leading-snug text-muted">
              Every figure above is computed in SQL. The model only reads those figures and writes the prose.
            </p>
          </div>
          <Button onClick={generate} disabled={thinking}>
            {thinking ? 'Thinking…' : summary ? 'Regenerate' : 'Generate summary'}
          </Button>
        </CardHeader>

        <CardContent className="relative">
          {thinking ? (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-[0.84rem] text-muted">
                Reading {money(t.revenue)} across {t.orders} orders…
              </p>
              {[92, 78, 86].map((w) => (
                <div key={w} className="ob-skeleton h-3" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : null}

          {aiError ? (
            <Alert tone="error" title="Summary failed">
              {aiError} — the numbers above are unaffected. Retry when Ollama is reachable.
            </Alert>
          ) : null}

          {summary && !thinking ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <SummaryText text={summary.summary} />
              <p className="mt-4 border-t border-line pt-3 text-[0.72rem] text-muted">
                model {summary.model} · generated {summary.generated_at.replace('T', ' ')}
              </p>
            </motion.div>
          ) : null}

          {!summary && !thinking && !aiError ? (
            <p className="py-2 text-[0.84rem] text-muted">
              Nothing generated yet for this range. The card asks the local model for a plain-language read of the numbers above.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Page>
  );
}
