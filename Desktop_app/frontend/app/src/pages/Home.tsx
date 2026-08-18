import { useEffect, useState } from 'react';
import { useApp, formatCurrency } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';

const LOW_STOCK_THRESHOLD = 20;

export default function Home() {
  const { state, dispatch } = useApp();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const today = new Date().toISOString().split('T')[0];

  const allSlips = state.clients.flatMap(c =>
    c.slips.map(s => ({ ...s, clientName: c.name }))
  );

  const todaySlips = allSlips.filter(s => s.date === today);
  const todayRevenue = todaySlips.reduce((sum, s) => sum + s.total, 0);
  const lowStockCount = state.articles.filter(a => a.stock < LOW_STOCK_THRESHOLD).length;

  const recentSlips = [...allSlips]
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .slice(0, 5);

  const dateTimeLabel = now.toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }) + ' — ' + now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const statCards = [
    {
      label: "TODAY'S SALES",
      value: todaySlips.length,
      sub: 'slips confirmed',
      color: 'var(--dark-heading)',
      onClick: undefined as (() => void) | undefined,
    },
    {
      label: "TODAY'S REVENUE",
      value: formatCurrency(todayRevenue),
      sub: 'earned today',
      color: 'var(--gold-text)',
      onClick: undefined as (() => void) | undefined,
    },
    {
      label: 'TOTAL CLIENTS',
      value: state.clients.length,
      sub: 'registered clients',
      color: 'var(--dark-heading)',
      onClick: undefined as (() => void) | undefined,
    },
    {
      label: 'LOW STOCK',
      value: lowStockCount,
      sub: 'articles need restock',
      color: 'var(--error)',
      onClick: () => dispatch({ type: 'NAVIGATE', page: 'stock' }),
    },
  ];

  return (
    <AppLayout pageTitle="Home">
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Welcome Header */}
        <h1 className="font-lora font-semibold" style={{ fontSize: 28, color: 'var(--dark-heading)' }}>
          Welcome back, Bilal Ahmed
        </h1>
        <p className="font-inter" style={{ fontSize: 13, color: 'var(--secondary-text)', marginTop: 6 }}>
          {dateTimeLabel}
        </p>
        <div style={{ height: 2, width: 48, background: 'var(--brand-gold)', margin: '12px 0 32px 0' }} />

        {/* Stat Cards */}
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {statCards.map(card => (
            <div
              key={card.label}
              onClick={card.onClick}
              className={`home-stat-card${card.label === 'LOW STOCK' ? ' home-stat-card-danger' : ''}`}
              style={{
                background: 'var(--card-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 10,
                padding: '22px 20px',
                cursor: card.onClick ? 'pointer' : 'default',
              }}
            >
              <div
                className="font-inter font-semibold uppercase"
                style={{ fontSize: 11, letterSpacing: '0.6px', color: 'var(--secondary-text)' }}
              >
                {card.label}
              </div>
              <div className="font-lora font-semibold" style={{ fontSize: 32, color: card.color, marginTop: 8 }}>
                {card.value}
              </div>
              <div className="font-inter" style={{ fontSize: 12, color: 'var(--muted-text)', marginTop: 4 }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Slips */}
        <div className="card-white" style={{ marginTop: 32 }}>
          <div
            className="font-lora font-semibold"
            style={{ fontSize: 18, color: 'var(--dark-heading)', padding: '18px 22px', borderBottom: '1px solid var(--border-color)' }}
          >
            Recent Slips
          </div>

          {recentSlips.length > 0 && (
            <div
              className="grid gap-4 px-5 py-3 soleria-table-header"
              style={{ gridTemplateColumns: '90px 1fr 1fr 120px', padding: '10px 22px', background: 'var(--app-bg)' }}
            >
              <span>Date</span>
              <span>Slip No</span>
              <span>Client</span>
              <span className="text-right">Amount</span>
            </div>
          )}

          {recentSlips.map(slip => (
            <div
              key={slip.id}
              className="grid gap-4 items-center soleria-table-row font-inter"
              style={{ gridTemplateColumns: '90px 1fr 1fr 120px', padding: '12px 22px', fontSize: 14, color: 'var(--primary-text)' }}
            >
              <span>{new Date(slip.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{slip.no}</span>
              <span className="truncate">{slip.clientName}</span>
              <span className="text-right font-lora font-semibold" style={{ color: 'var(--gold-text)' }}>
                {formatCurrency(slip.total)}
              </span>
            </div>
          ))}

          {recentSlips.length === 0 && (
            <div className="font-inter text-center" style={{ color: 'var(--muted-text)', fontSize: 13, padding: 32 }}>
              No slips yet
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
