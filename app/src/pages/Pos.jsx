import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { api, money } from '../api.js';
import { useApi } from '../useApi.js';
import { Page, PageHeader } from '../components/ui/page.jsx';
import { BentoCard, BentoGrid } from '../components/ui/bento.jsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button, ButtonLink } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Checkbox, Field, Input, Select, Textarea } from '../components/ui/field.jsx';
import { SegmentedControl } from '../components/ui/segmented.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';
import { SkeletonRows } from '../components/ui/skeleton.jsx';
import { PHONE_MAX, PHONE_MIN, digitsOf } from '../lib/phone.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function TotalRow({ label, value, strong, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[0.86rem]">
      <span className={strong ? 'font-semibold text-ink' : 'text-muted'}>{label}</span>
      <span
        className={
          strong
            ? 'font-display text-[1.25rem] leading-none tabular-nums'
            : `tabular-nums ${tone ?? 'text-[var(--ob-text-secondary)]'}`
        }
      >
        {value}
      </span>
    </div>
  );
}

function Placed({ order, taxPercent, onReset }) {
  return (
    <BentoGrid>
      <BentoCard span={12} className="p-0">
        <CardHeader className="border-b-0">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ob-success)_16%,transparent)] text-leaf">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.14em] text-muted">Order placed</div>
              <h1 className="font-display text-[1.6rem] leading-tight">{order.order_no}</h1>
            </div>
          </div>
          <Badge tone="success" dot>{order.status}</Badge>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="flex flex-col gap-1.5">
            {order.items.map((line) => (
              <div key={line.id} className="flex items-baseline justify-between gap-4 text-[0.86rem]">
                <span className="min-w-0 truncate">
                  <span className="text-muted">{line.qty} × </span>{line.name}
                </span>
                <span className="tabular-nums">{money(line.line_total)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-[var(--ob-radius-md)] bg-surface-2/80 p-4">
            <TotalRow label="Subtotal" value={money(order.subtotal)} />
            {order.discount > 0 ? <TotalRow label="Discount" value={`−${money(order.discount)}`} tone="text-gold" /> : null}
            <TotalRow label={`Tax (${taxPercent}%)`} value={money(order.tax)} />
            <div className="mt-1 border-t border-line pt-2">
              <TotalRow label="Total" value={money(order.total)} strong />
            </div>
            {order.outstanding > 0 ? (
              <TotalRow label="Balance due" value={money(order.outstanding)} tone="text-rouge" />
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button variant="secondary" onClick={onReset}>Next order</Button>
          <ButtonLink to={`/orders/${order.id}`}>Open order</ButtonLink>
        </CardFooter>
      </BentoCard>
    </BentoGrid>
  );
}

export default function Pos() {
  const catalog = useApi('/products');
  const people = useApi('/customers');
  const meta = useApi('/settings');
  const reduceMotion = useReducedMotion();

  const [cart, setCart] = useState({});
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [phone, setPhone] = useState('');
  const [walkIn, setWalkIn] = useState(false);
  const [newName, setNewName] = useState('');
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
  const byId = useMemo(
    () => Object.fromEntries((catalog.data ?? []).map((p) => [p.id, p])),
    [catalog.data],
  );

  const shown = (catalog.data ?? [])
    .filter((p) => p.active)
    .filter((p) => category === 'All' || p.category === category)
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: byId[id], qty }))
    .filter((l) => l.product);
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const discountAmt = (subtotal * (Number(discount) || 0)) / 100;
  const taxAmt = ((subtotal - discountAmt) * taxPercent) / 100;
  const total = subtotal - discountAmt + taxAmt;
  const units = lines.reduce((s, l) => s + l.qty, 0);

  const phoneDigits = digitsOf(phone);
  const phoneValid = phoneDigits.length >= PHONE_MIN && phoneDigits.length <= PHONE_MAX;
  const matched = phoneValid
    ? (people.data ?? []).find((c) => digitsOf(c.phone) === phoneDigits) ?? null
    : null;
  const needsPhone = !walkIn && !phoneValid;
  const phoneHint = walkIn ? null
    : matched ? <span className="text-leaf">Known customer — {matched.display ?? matched.name ?? phoneDigits}.</span>
    : phoneValid ? <span className="text-gold">New number — saved as a customer when you place this order.</span>
    : phoneDigits ? <span className="text-rouge">Too short — need {PHONE_MIN} to {PHONE_MAX} digits.</span>
    : 'Mobile number is compulsory. The name is optional.';

  const bump = (id, delta) =>
    setCart((c) => {
      const next = { ...c };
      const qty = (next[id] ?? 0) + delta;
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const order = await api.post('/orders', {
        items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
        customer_phone: walkIn ? null : phoneDigits,
        customer_name: walkIn || matched ? null : newName.trim() || null,
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
      setPhone('');
      setNewName('');
      setWalkIn(false);
      // A new number became a customer during the submit, so the match list is
      // stale from here on.
      people.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (placed) {
    return (
      <Page>
        <PageHeader title="New order" subtitle="Totals are recalculated by the API on submit." />
        <Placed order={placed} taxPercent={taxPercent} onReset={() => setPlaced(null)} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="New order"
        subtitle="Use + and − on a product to add or remove it. Totals are recalculated by the API on submit."
        actions={
          units > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[0.8rem]">
              <ShoppingBag className="size-4 text-roast" aria-hidden />
              <span className="tabular-nums">{units} units</span>
              <span className="font-display text-[1rem] tabular-nums text-ink">{money(total)}</span>
            </span>
          ) : null
        }
      />

      {error ? <Alert tone="error" title="Could not save">{error}</Alert> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-0">
            <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
              <Input
                name="search"
                placeholder="Search products"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search products"
              />
              <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
                <option value="All">All categories</option>
                {(meta.data?.categories ?? []).map((c) => <option key={c}>{c}</option>)}
              </Select>
            </CardContent>
          </Card>

          {catalog.loading ? (
            <SkeletonRows rows={6} />
          ) : shown.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={ShoppingBag}
                  title="No products match"
                  description="Try a different search term or category."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(172px,1fr))]">
              {shown.map((p) => {
                const qty = cart[p.id] ?? 0;
                return (
                  <div
                    key={p.id}
                    className="ob-tile relative flex min-h-[132px] flex-col justify-between gap-3 overflow-hidden p-3.5"
                    data-in-cart={qty > 0}
                  >
                    <div className="min-w-0">
                      <div className="text-[0.62rem] uppercase tracking-[0.12em] text-muted">{p.category}</div>
                      <div className="mt-1 line-clamp-2 text-[0.88rem] font-semibold leading-snug">{p.name}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-display text-[1.02rem] text-ink tabular-nums">{money(p.price)}</div>
                      <div
                        className="flex items-center gap-0.5 rounded-full border border-line bg-bg-deep/55 p-0.5"
                        role="group"
                        aria-label={`${p.name}: ${qty} in cart`}
                      >
                        <button
                          type="button"
                          aria-label={`Remove one ${p.name}`}
                          disabled={qty === 0}
                          onClick={() => bump(p.id, -1)}
                          className="ob-press grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35"
                        >
                          <Minus className="size-3.5" aria-hidden />
                        </button>
                        <motion.span
                          key={qty}
                          initial={reduceMotion ? false : { scale: 0.7, opacity: 0.4 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 620, damping: 26 }}
                          className="ob-num min-w-6 text-center text-[0.86rem] text-ink"
                        >
                          {qty || '·'}
                        </motion.span>
                        <button
                          type="button"
                          aria-label={`Add one ${p.name}`}
                          onClick={() => bump(p.id, 1)}
                          className="ob-press grid size-8 place-items-center rounded-full bg-leaf/12 text-leaf hover:bg-leaf/22"
                        >
                          <Plus className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Card className="xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle>Cart</CardTitle>
            {units > 0 ? <Badge tone="roast">{units} units</Badge> : null}
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {lines.length === 0 ? (
              <p className="py-2 text-[0.84rem] text-muted">Nothing added yet — press + on a product to start.</p>
            ) : (
              <ul className="flex flex-col">
                <AnimatePresence initial={false}>
                  {lines.map((l) => (
                    <motion.li
                      key={l.product.id}
                      layout={!reduceMotion}
                      initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden border-b border-line last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[0.86rem] font-medium">{l.product.name}</div>
                          <div className="text-[0.7rem] text-muted tabular-nums">{money(l.product.price)} each</div>
                        </div>
                        <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-0.5">
                          <button
                            type="button"
                            aria-label={`Remove one ${l.product.name}`}
                            onClick={() => bump(l.product.id, -1)}
                            className="grid size-8 place-items-center rounded-full hover:bg-surface-2"
                          >
                            <Minus className="size-3.5" aria-hidden />
                          </button>
                          <span className="min-w-5 text-center text-[0.84rem] font-semibold tabular-nums">{l.qty}</span>
                          <button
                            type="button"
                            aria-label={`Add one ${l.product.name}`}
                            onClick={() => bump(l.product.id, 1)}
                            className="grid size-8 place-items-center rounded-full hover:bg-surface-2"
                          >
                            <Plus className="size-3.5" aria-hidden />
                          </button>
                        </div>
                        <div className="w-20 text-right text-[0.86rem] font-semibold tabular-nums">
                          {money(l.product.price * l.qty)}
                        </div>
                        <button
                          type="button"
                          aria-label={`Clear ${l.product.name} from cart`}
                          onClick={() => bump(l.product.id, -l.qty)}
                          className="grid size-8 place-items-center rounded-full text-muted hover:bg-rouge/10 hover:text-rouge"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            <div className="grid gap-3 border-t border-line pt-4">
              {walkIn ? (
                <p className="rounded-[var(--ob-radius-md)] border border-line bg-surface-2/60 px-3 py-2.5 text-[0.78rem] text-muted">
                  Walk-in sale — nothing is stored against a customer.
                </p>
              ) : (
                <Field label="Mobile number" htmlFor="customer_phone" hint={phoneHint}>
                  <Input
                    id="customer_phone"
                    name="customer_phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="Compulsory"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
              )}

              {!walkIn && phoneValid && !matched ? (
                <Field label="Name (optional)" htmlFor="customer_name">
                  <Input
                    id="customer_name"
                    name="customer_name"
                    placeholder="Ask if they give one"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </Field>
              ) : null}

              <Checkbox
                name="walk_in"
                label="No number — sell as walk-in"
                checked={walkIn}
                onChange={(e) => setWalkIn(e.target.checked)}
              />

              <Field label="Channel">
                <SegmentedControl
                  label="Channel"
                  value={channel}
                  onChange={setChannel}
                  options={(meta.data?.channels ?? ['counter']).map((c) => ({ id: c, label: cap(c) }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Discount %" htmlFor="discount_percent">
                  <Input
                    id="discount_percent"
                    name="discount_percent"
                    type="number"
                    min="0"
                    max="100"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </Field>
                <Field label="Payment" htmlFor="payment_method">
                  <Select id="payment_method" name="payment_method" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {(meta.data?.payment_methods ?? ['cash']).map((m) => <option key={m} value={m}>{cap(m)}</option>)}
                  </Select>
                </Field>
              </div>

              <Checkbox
                name="fully_paid"
                label="Paid in full"
                checked={fullyPaid}
                onChange={(e) => setFullyPaid(e.target.checked)}
              />
              {!fullyPaid ? (
                <Field label="Amount received" htmlFor="amount_received">
                  <Input
                    id="amount_received"
                    name="amount_received"
                    type="number"
                    min="0"
                    step="0.01"
                    value={partial}
                    onChange={(e) => setPartial(e.target.value)}
                  />
                </Field>
              ) : null}

              <Textarea
                name="note"
                rows={2}
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="Order note"
              />
            </div>
          </CardContent>

          <CardFooter className="block">
            <div className="flex flex-col gap-1.5">
              <TotalRow label="Subtotal" value={money(subtotal)} />
              {discountAmt > 0 ? <TotalRow label={`Discount ${discount}%`} value={`−${money(discountAmt)}`} tone="text-gold" /> : null}
              <TotalRow label={`Tax ${taxPercent}%`} value={money(taxAmt)} />
              <div className="mt-1.5 border-t border-line pt-2">
                <TotalRow label="Total" value={money(total)} strong />
              </div>
              {!fullyPaid ? (
                <TotalRow label="Balance due" value={money(Math.max(total - Number(partial || 0), 0))} tone="text-rouge" />
              ) : null}
            </div>
            <Button
              className="mt-3 w-full"
              disabled={!lines.length || busy || needsPhone}
              onClick={submit}
            >
              {busy ? 'Saving…'
                : needsPhone ? 'Add the mobile number'
                : `Place order · ${money(total)}`}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </Page>
  );
}
