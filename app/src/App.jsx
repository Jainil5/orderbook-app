import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Pos from './pages/Pos.jsx';
import Products from './pages/Products.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Customers from './pages/Customers.jsx';
import Insights from './pages/Insights.jsx';
import Intelligence from './pages/Intelligence.jsx';

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/pos', label: 'New order' },
  { to: '/orders', label: 'Orders' },
  { to: '/products', label: 'Products' },
  { to: '/customers', label: 'Customers' },
  { to: '/insights', label: 'Insights' },
  { to: '/intelligence', label: 'Intelligence' },
];

export default function App() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => setSettings(false));
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">{settings?.business_name ?? 'OrderBook'}</div>
        <div className="brand-sub">Local POS</div>
        <nav className="nav">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>
          ))}
        </nav>
      </aside>

      <nav className="mobile-nav">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>
        ))}
      </nav>

      <main className="main">
        {settings === false && (
          <div className="error">
            API unreachable on port 8000. Start it with{' '}
            <code>python3 -m uvicorn backend.main:app --port 8000</code> from the project root.
          </div>
        )}
        <Routes>
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
      </main>
    </div>
  );
}
