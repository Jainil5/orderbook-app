import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ChartLine,
  LayoutDashboard,
  Package,
  ReceiptText,
  ScanLine,
  Sparkles,
  Store,
  Users,
} from 'lucide-react';
import { api } from './api.js';
import { Alert } from './components/ui/alert.jsx';
import { CardGlow } from './components/effects/card-glow.jsx';
import { FlowField } from './components/effects/flow-field.jsx';
import { Meteors } from './components/effects/meteors.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Pos from './pages/Pos.jsx';
import Products from './pages/Products.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Customers from './pages/Customers.jsx';
import Insights from './pages/Insights.jsx';
import Intelligence from './pages/Intelligence.jsx';

const LINKS = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/pos', label: 'New order', short: 'POS', icon: ScanLine },
  { to: '/orders', label: 'Orders', short: 'Orders', icon: ReceiptText },
  { to: '/products', label: 'Products', short: 'Catalog', icon: Package },
  { to: '/customers', label: 'Customers', short: 'People', icon: Users },
  { to: '/insights', label: 'Insights', short: 'Trends', icon: ChartLine },
  { to: '/intelligence', label: 'Intelligence', short: 'Ask', icon: Sparkles },
];

function NavItem({ link, position }) {
  const reduceMotion = useReducedMotion();
  const Icon = link.icon;

  return (
    <NavLink
      to={link.to}
      end={link.end}
      className={({ isActive }) =>
        [
          'ob-nav-link group relative flex items-center gap-3 rounded-xl',
          position === 'side' ? 'px-3 py-2.5 text-[0.88rem]' : 'flex-col gap-1 px-1 py-2 text-[0.62rem]',
          isActive ? 'font-semibold text-leaf-ink' : position === 'side' ? 'text-muted hover:text-text' : 'text-muted hover:text-text',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <motion.span
              layoutId={`ob-nav-active-${position}`}
              className={
                position === 'side'
                  ? 'absolute inset-0 -z-10 rounded-xl bg-leaf shadow-[0_8px_20px_rgba(95,214,138,0.35)]'
                  : 'absolute inset-x-1 inset-y-0 -z-10 rounded-lg bg-leaf'
              }
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
            />
          ) : null}
          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} aria-hidden />
          <span className={position === 'side' ? 'truncate' : 'leading-none'}>
            {position === 'side' ? link.label : link.short}
          </span>
        </>
      )}
    </NavLink>
  );
}

export default function App() {
  const [settings, setSettings] = useState(null);
  const location = useLocation();

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => setSettings(false));
  }, []);

  return (
    <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-[236px_minmax(0,1fr)]">
      <FlowField />
      <CardGlow />

      <aside className="ob-shell sticky top-0 z-[1] hidden h-screen flex-col overflow-hidden border-r border-line px-4 py-6 lg:flex">
        <div className="ob-grid-lines pointer-events-none absolute inset-0 opacity-[0.5]" aria-hidden />
        <Meteors count={7} seed={11} />
        <Link
          to="/pos"
          title="Go to New order"
          aria-label="Go to New order"
          className="ob-press relative -mx-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/[0.06]"
        >
          <span className="ob-mark grid h-9 w-9 place-items-center rounded-xl shadow-[0_6px_16px_rgba(95,214,138,0.4)]">
            <Store className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-[1.05rem] leading-tight text-text">
              {settings?.business_name ?? 'OrderBook'}
            </span>
            <span className="ob-label mt-1 block">Local POS</span>
          </span>
        </Link>

        <nav className="relative mt-7 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {LINKS.map((l) => <NavItem key={l.to} link={l} position="side" />)}
        </nav>

        <div className="relative mt-4 border-t border-line px-1 pt-3 text-[0.68rem] leading-relaxed text-muted">
          Data stays on this machine.
          <br />
          {settings?.currency ? `Amounts in ${settings.currency}.` : 'Waiting for settings…'}
        </div>
      </aside>

      <nav className="ob-shell fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-line px-1 py-1 lg:hidden">
        {LINKS.map((l) => <NavItem key={l.to} link={l} position="tab" />)}
      </nav>

      <div className="relative z-[1] min-w-0">
        <header className="ob-shell flex items-center gap-2 border-b border-line px-4 py-2.5 lg:hidden">
          <Link
            to="/pos"
            aria-label="Go to New order"
            className="ob-press -my-2 -mx-1 flex min-w-0 items-center gap-2 rounded-lg px-1 py-2"
          >
            <span className="ob-mark grid h-7 w-7 place-items-center rounded-lg">
              <Store className="h-4 w-4" />
            </span>
            <span className="truncate font-display text-[0.95rem]">
              {settings?.business_name ?? 'OrderBook'}
            </span>
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1260px] px-4 pb-28 pt-5 lg:px-8 lg:pb-12">
          {settings === false ? (
            <Alert
              tone="offline"
              title="API unreachable on port 8000"
              className="mb-4"
            >
              Start it with{' '}
              <code className="rounded-md bg-line/60 px-1.5 py-0.5 font-mono text-[0.78em]">
                python3 -m uvicorn backend.main:app --port 8000
              </code>{' '}
              from the project root.
            </Alert>
          ) : null}

          <div key={location.pathname} className="ob-page-enter">
            <Routes location={location}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pos" element={<Pos />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route path="/products" element={<Products />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/intelligence" element={<Intelligence />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
