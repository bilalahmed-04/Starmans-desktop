import { useState } from 'react';
import { useApp, formatCurrency, isDateInCurrentWeek, getPairsSold, getWeekRange } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';
import { Search, ArrowRight, Receipt, Package, Printer } from 'lucide-react';
import type { Slip } from '@/types';

type TabType = 'clients' | 'weekly' | 'monthly';
type ReportSlip = Slip & { clientName: string };

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function SlipsPage() {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('clients');
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);

  const filteredClients = state.clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const allSlips: ReportSlip[] = state.clients.flatMap(client =>
    client.slips.map(slip => ({ ...slip, clientName: client.name }))
  );

  const weeklySlips = allSlips.filter(s => isDateInCurrentWeek(s.date));
  const monthlySlips = allSlips.filter(s => s.date.slice(0, 7) === selectedMonth);

  const weeklyTotal = weeklySlips.reduce((s, slip) => s + slip.total, 0);
  const weeklyPairs = weeklySlips.reduce((s, slip) => s + getPairsSold(slip), 0);

  const monthlyTotal = monthlySlips.reduce((s, slip) => s + slip.total, 0);
  const monthlyPairs = monthlySlips.reduce((s, slip) => s + getPairsSold(slip), 0);

  function navigate(page: string) {
    dispatch({ type: 'NAVIGATE', page });
  }

  function openClient(clientId: string) {
    dispatch({ type: 'SELECT_CLIENT', clientId });
    navigate('client-detail');
  }

  return (
    <AppLayout
      pageTitle="Slips"
      headerAction={
        activeTab !== 'clients' ? (
          <button onClick={() => window.print()} className="btn-navy flex items-center gap-2">
            <Printer size={16} />
            Print Report
          </button>
        ) : undefined
      }
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Tab bar */}
        <div className="tab-pill-container mb-6">
          <button
            onClick={() => setActiveTab('clients')}
            className={activeTab === 'clients' ? 'tab-pill-active' : 'tab-pill-inactive'}
          >
            Clients
          </button>
          <button
            onClick={() => setActiveTab('weekly')}
            className={activeTab === 'weekly' ? 'tab-pill-active' : 'tab-pill-inactive'}
          >
            Weekly Report
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={activeTab === 'monthly' ? 'tab-pill-active' : 'tab-pill-inactive'}
          >
            Monthly Report
          </button>
        </div>

        {activeTab === 'clients' && (
          <>
            <div className="mb-4" style={{ maxWidth: 280 }}>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--secondary-text)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search clients..."
                  className="soleria-input pl-9"
                  style={{ fontSize: '13px' }}
                />
              </div>
            </div>

            {/* Premium Client Cards Grid */}
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
            >
              {filteredClients.map(client => (
                <button
                  key={client.id}
                  onClick={() => openClient(client.id)}
                  className="text-left rounded-xl transition-all duration-200 group"
                  style={{
                    background: 'var(--app-bg)',
                    border: '1px solid var(--border-color)',
                    padding: '22px 20px',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = '0 10px 26px rgba(27,42,65,0.10)';
                    e.currentTarget.style.borderColor = 'var(--brand-gold)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="flex items-center justify-center rounded-lg flex-shrink-0"
                      style={{
                        width: 42,
                        height: 42,
                        background: 'var(--brand-navy)',
                      }}
                    >
                      <span className="font-lora font-semibold text-sm" style={{ color: 'var(--brand-gold)' }}>
                        {client.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-1 font-inter font-medium"
                      style={{ fontSize: '12px', color: 'var(--brand-gold)' }}
                    >
                      View <ArrowRight size={14} />
                    </div>
                  </div>

                  <h3
                    className="font-lora font-semibold mb-1"
                    style={{ fontSize: '16px', color: 'var(--dark-heading)' }}
                  >
                    {client.name}
                  </h3>

                  <p className="font-inter mb-3" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
                    {client.phone}
                  </p>

                  <div className="flex items-center gap-4 pt-3" style={{ borderTop: '1px solid var(--border-table)' }}>
                    <div className="flex items-center gap-1.5">
                      <Receipt size={13} style={{ color: 'var(--secondary-text)' }} />
                      <span className="font-inter font-medium" style={{ fontSize: '12px', color: 'var(--primary-text)' }}>
                        {client.slips.length} {client.slips.length === 1 ? 'slip' : 'slips'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Package size={13} style={{ color: 'var(--secondary-text)' }} />
                      <span className="font-inter" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
                        {client.slips.reduce((s, sl) => s + getPairsSold(sl), 0)} pairs
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 font-lora font-semibold" style={{ fontSize: '14px', color: 'var(--brand-gold)' }}>
                    {formatCurrency(client.slips.reduce((s, sl) => s + sl.total, 0))}
                  </div>
                </button>
              ))}
            </div>

            {filteredClients.length === 0 && (
              <div className="text-center py-12 font-inter" style={{ color: 'var(--muted-text)' }}>
                No clients found.
              </div>
            )}
          </>
        )}

        {activeTab === 'weekly' && (
          <ReportView
            title={`Weekly Report — ${getWeekRange()}`}
            slips={weeklySlips}
            total={weeklyTotal}
            pairs={weeklyPairs}
          />
        )}

        {activeTab === 'monthly' && (
          <>
            <div className="mb-4 flex justify-end" data-no-print>
              <input
                type="month"
                value={selectedMonth}
                onChange={event => {
                  if (event.target.value) setSelectedMonth(event.target.value);
                }}
                className="soleria-input"
                style={{ width: 180, fontSize: '13px' }}
                aria-label="Filter slips by month"
              />
            </div>
            <ReportView
              title={`Monthly Report — ${new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`}
              slips={monthlySlips}
              total={monthlyTotal}
              pairs={monthlyPairs}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}

function ReportView({ title, slips, total, pairs }: { title: string; slips: ReportSlip[]; total: number; pairs: number }) {
  return (
    <div className="card-white">
      <div className="px-6 py-4" style={{ borderBottom: '2px solid var(--border-section)' }}>
        <h3 className="font-lora font-semibold" style={{ fontSize: '18px', color: 'var(--dark-heading)' }}>
          {title}
        </h3>
      </div>

      <div
        className="grid gap-4 px-6 py-3 soleria-table-header"
        style={{
          gridTemplateColumns: '90px 80px 1fr 1fr 110px',
          background: 'var(--app-bg)'
        }}
      >
        <span>Date</span>
        <span>Slip No</span>
        <span>Client</span>
        <span>Articles</span>
        <span className="text-right">Amount</span>
      </div>

      {slips.map(slip => {
        return (
          <div
            key={slip.id}
            className="grid gap-4 px-6 py-3 soleria-table-row items-center"
            style={{
              gridTemplateColumns: '90px 80px 1fr 1fr 110px'
            }}
          >
            <span className="font-inter" style={{ fontSize: '13px', color: 'var(--primary-text)' }}>
              {new Date(slip.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="font-inter font-semibold" style={{ fontSize: '13px', color: 'var(--dark-heading)' }}>
              {slip.no}
            </span>
            <span className="font-inter" style={{ fontSize: '13px', color: 'var(--primary-text)' }}>
              {slip.clientName}
            </span>
            <span className="font-inter" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
              {slip.items.map(it => it.name).join(', ')}
            </span>
            <span className="text-right font-lora font-semibold" style={{ fontSize: '14px', color: 'var(--brand-gold)' }}>
              {formatCurrency(slip.total)}
            </span>
          </div>
        );
      })}

      {slips.length === 0 && (
        <div className="px-6 py-8 text-center font-inter" style={{ color: 'var(--muted-text)', fontSize: '13px' }}>
          No slips found for this period.
        </div>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderTop: '2px solid var(--border-section)' }}
      >
        <div className="flex items-center gap-6">
          <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>
            <strong style={{ color: 'var(--primary-text)' }}>{slips.length}</strong> Slips
          </span>
          <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>
            <strong style={{ color: 'var(--primary-text)' }}>{pairs}</strong> Pairs Sold
          </span>
        </div>
        <span className="font-lora font-semibold" style={{ fontSize: '26px', color: 'var(--brand-gold)' }}>
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}
