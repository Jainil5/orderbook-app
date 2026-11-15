import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Check, Clock, Wallet } from 'lucide-react';
import { api, day, money, timeOf } from '../api.js';
import { useApi } from '../useApi.js';
import { Page, PageHeader } from '../components/ui/page.jsx';
import { BentoCard, BentoGrid } from '../components/ui/bento.jsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { StatusBadge } from '../components/ui/badge.jsx';
import { Field, Input, Select } from '../components/ui/field.jsx';
import { Table, TBody, TD, TH, THead, TR, TableScroll } from '../components/ui/table.jsx';
import { SkeletonRows } from '../components/ui/skeleton.jsx';
import { Alert } from '../components/ui/alert.jsx';

const FLOW = ['open', 'confirmed', 'preparing', 'ready', 'delivered'];

function Row({ label, value, strong, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[0.86rem]">
      <span className={strong ? 'font-semibold' : 'text-muted'}>{label}</span>
      <span
        className={
          strong
            ? 'font-display text-[1.3rem] leading-none tabular-nums'
            : `tabular-nums ${tone ?? 'text-[var(--ob-text-secondary)]'}`
        }
      >
        {value}
      </span>
    </div>
  );
}

function Stepper({ index }) {
  const reduceMotion = useReducedMotion();
  const pct = index < 0 ? 0 : ((index + 1) / FLOW.length) * 100;

  return (
    <div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-line/80">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-[image:var(--ob-gradient-primary)]"
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1 text-center">
        {FLOW.map((s, i) => {
          const done = i <= index;
          return (
            <li key={s} className="flex flex-col items-center gap-1">
              <span
                className={[
                  'grid size-6 place-items-center rounded-full text-[0.7rem] font-bold transition-colors',
                  done ? 'bg-leaf text-leaf-ink' : 'border border-line bg-surface text-muted',
                ].join(' ')}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={`text-[0.66rem] capitalize ${done ? 'font-semibold text-ink' : 'text-muted'}`}>
                {s}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

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

  if (loading) {
    return (
      <Page>
        <PageHeader title="Order" subtitle="Loading…" />
        <SkeletonRows rows={6} />
      </Page>
    );
  }
  if (error) return <Alert tone="error" title="Could not load this order">{error}</Alert>;
  if (!order) return null;

  const index = FLOW.indexOf(order.status);
  const next = index >= 0 && index < FLOW.length - 1 ? FLOW[index + 1] : null;

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link
            to="/orders"
            className="inline-flex items-center gap-1.5 text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:text-leaf"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            All orders
          </Link>
        }
        title={order.order_no}
        subtitle={`${day(order.created_at)} · ${timeOf(order.created_at)} · ${order.channel} · ${order.customer_name ?? 'walk-in'}`}
        actions={<StatusBadge status={order.status} className="px-3 py-1 text-[0.78rem]" />}
      />

      {failed ? <Alert tone="error" title="Change not saved">{failed}</Alert> : null}

      <BentoGrid>
        <BentoCard span={7} className="overflow-hidden p-0">
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <span className="text-[0.78rem] text-muted">
              {order.items.length} {order.items.length === 1 ? 'line' : 'lines'}
            </span>
          </CardHeader>
          <TableScroll>
            <Table minWidth={460}>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH num>Qty</TH>
                  <TH num>Price</TH>
                  <TH num>Line total</TH>
                </TR>
              </THead>
              <TBody>
                {order.items.map((line) => (
                  <TR key={line.id}>
                    <TD>{line.name}</TD>
                    <TD num>{line.qty}</TD>
                    <TD num>{money(line.unit_price)}</TD>
                    <TD num>{money(line.line_total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroll>
          <CardFooter className="block">
            <div className="flex flex-col gap-1.5">
              <Row label="Subtotal" value={money(order.subtotal)} />
              {order.discount > 0 ? <Row label="Discount" value={`−${money(order.discount)}`} tone="text-gold" /> : null}
              <Row label="Tax" value={money(order.tax)} />
              <div className="mt-1.5 border-t border-line pt-2">
                <Row label="Total" value={money(order.total)} strong />
              </div>
              <Row label={`Paid · ${order.payment_method}`} value={money(order.paid_amount)} />
              <Row
                label="Balance"
                value={money(order.outstanding)}
                tone={order.outstanding > 0 ? 'text-rouge' : 'text-leaf'}
              />
            </div>
          </CardFooter>
          {order.note ? (
            <div className="border-t border-line bg-gold/8 px-5 py-3.5 text-[0.84rem] leading-snug">
              {order.note}
            </div>
          ) : null}
        </BentoCard>

        <div className="flex min-w-0 flex-col gap-4 md:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-roast" aria-hidden />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3.5">
              {order.status === 'cancelled' ? (
                <Alert tone="info" title="Cancelled">
                  Create a new order to replace it.
                </Alert>
              ) : (
                <Stepper index={index} />
              )}

              {next ? (
                <Button disabled={busy} onClick={() => patch({ status: next })}>
                  Mark {next}
                </Button>
              ) : null}

              {order.status !== 'cancelled' && order.status !== 'delivered' ? (
                <Button variant="ghost" disabled={busy} onClick={() => patch({ status: 'cancelled' })}>
                  Cancel order
                </Button>
              ) : null}

              {order.status === 'delivered' && order.outstanding > 0 ? (
                <p className="text-[0.8rem] text-rouge">
                  Delivered with {money(order.outstanding)} still owed.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="size-4 text-roast" aria-hidden />
                Payment
              </CardTitle>
              <span className="text-[0.78rem] text-muted">
                {money(order.paid_amount)} of {money(order.total)}
              </span>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field label="Total paid" htmlFor="paid_amount" hint="Leave blank to keep the current amount.">
                <Input
                  id="paid_amount"
                  name="paid_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={payment}
                  placeholder={String(order.paid_amount)}
                  onChange={(e) => setPayment(e.target.value)}
                />
              </Field>
              <Field label="Method" htmlFor="payment_method">
                <Select id="payment_method" name="payment_method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {(meta.data?.payment_methods ?? ['cash']).map((m) => <option key={m}>{m}</option>)}
                </Select>
              </Field>
              <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
                <Button variant="secondary" disabled={busy} onClick={() => patch({ paid_amount: order.total })}>
                  Fully paid
                </Button>
                <Button
                  disabled={busy || payment === ''}
                  onClick={() => patch({ paid_amount: Number(payment), payment_method: method })}
                >
                  Save payment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </BentoGrid>
    </Page>
  );
}
