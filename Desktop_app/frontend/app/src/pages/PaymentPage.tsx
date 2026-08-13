import { useState, useMemo } from 'react';
import { useApp, formatCurrency, isDateInCurrentWeek, isDateInMonth, getCurrentWeekStart, getCurrentWeekEnd } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';
import { Search, Printer } from 'lucide-react';
import { createPayment, getPayments } from '@/lib/payments';

type TabType = 'new' | 'weekly' | 'monthly';
type PaymentMethod = 'Cash' | 'Cheque' | 'Online' | 'Slip';

export default function PaymentPage() {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('new');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [amount, setAmount] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [desc, setDesc] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));

  const matchedClient = useMemo(() => {
    if (!clientName.trim()) return null;
    return state.clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
  }, [clientName, state.clients]);

  const phoneMatch = matchedClient && matchedClient.phone === clientPhone;
  const isVerified = matchedClient && phoneMatch;

  const canConfirm = isVerified && parseInt(amount) > 0 && (method !== 'Cheque' || !!chequeDate);

  async function handleConfirm() {
    if (!canConfirm || !matchedClient) return;

    setErrorMsg('');
    setSubmitting(true);
    try {
      await createPayment({
        clientName: matchedClient.name,
        clientPhone: matchedClient.phone,
        method,
        amount: parseInt(amount),
        desc,
        chequeDate: method === 'Cheque' ? chequeDate : undefined,
      });
      const payments = await getPayments();
      dispatch({ type: 'SET_PAYMENTS', payments });
      setClientName('');
      setClientPhone('');
      setAmount('');
      setChequeDate('');
      setDesc('');
      setMethod('Cash');
      setSuccessMsg('Payment recorded successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const weeklyPayments = state.payments.filter(p => isDateInCurrentWeek(p.date));
  const monthlyPayments = state.payments.filter(p => {
    const [year, month] = monthFilter.split('-').map(Number);
    return isDateInMonth(p.date, month - 1, year);
  });

  const filteredWeekly = weeklyPayments.filter(p =>
    p.clientName.toLowerCase().includes(searchText.toLowerCase()) ||
    p.clientPhone.includes(searchText) ||
    p.method.toLowerCase().includes(searchText.toLowerCase())
  );
  const filteredMonthly = monthlyPayments.filter(p =>
    p.clientName.toLowerCase().includes(searchText.toLowerCase()) ||
    p.clientPhone.includes(searchText) ||
    p.method.toLowerCase().includes(searchText.toLowerCase())
  );

  const weeklyTotal = filteredWeekly.reduce((s, p) => s + p.amount, 0);
  const monthlyTotal = filteredMonthly.reduce((s, p) => s + p.amount, 0);

  return (
    <AppLayout
      pageTitle="Payment"
      headerAction={
        activeTab !== 'new' ? (
          <button onClick={() => window.print()} className="btn-navy flex items-center gap-2">
            <Printer size={16} />
            Print {activeTab === 'weekly' ? 'Weekly' : 'Monthly'} Payments
          </button>
        ) : undefined
      }
    >
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="tab-pill-container mb-6" data-no-print>
          <button onClick={() => setActiveTab('new')} className={activeTab === 'new' ? 'tab-pill-active' : 'tab-pill-inactive'}>New Payment</button>
          <button onClick={() => setActiveTab('weekly')} className={activeTab === 'weekly' ? 'tab-pill-active' : 'tab-pill-inactive'}>Weekly</button>
          <button onClick={() => setActiveTab('monthly')} className={activeTab === 'monthly' ? 'tab-pill-active' : 'tab-pill-inactive'}>Monthly</button>
        </div>

        {activeTab === 'new' && (
          <>
            {successMsg && <div className="banner-success rounded-lg px-4 py-3 text-sm mb-4">{successMsg}</div>}
            {errorMsg && <div className="banner-error rounded-lg px-4 py-3 text-sm mb-4">{errorMsg}</div>}

            <div className="card-white p-6">
              <h3 className="font-lora font-semibold" style={{ fontSize: '20px', color: 'var(--dark-heading)' }}>Record a Payment</h3>
              <p className="font-inter mt-1 mb-5" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>Client name and phone must match an existing bill or slip record.</p>

              {/* Row 1: Client name + phone */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-inter font-semibold mb-1" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>Client Name</label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Ahmed Footwear" className="soleria-input" />
                </div>
                <div>
                  <label className="block font-inter font-semibold mb-1" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>Phone Number</label>
                  <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="e.g. 0300-1234567" className="soleria-input" />
                </div>
              </div>

              {/* Row 2: Method + Amount */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-inter font-semibold mb-1" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>Payment Method</label>
                  <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="soleria-input cursor-pointer">
                    <option>Cash</option>
                    <option>Cheque</option>
                    <option>Online</option>
                    <option>Slip</option>
                  </select>
                </div>
                <div>
                  <label className="block font-inter font-semibold mb-1" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>Amount Paid (Rs)</label>
                  <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="soleria-input" />
                </div>
              </div>

              {/* Cheque panel */}
              {method === 'Cheque' && (
                <div className="rounded-lg p-4 mb-4" style={{ background: 'var(--alt-surface)', border: '1px solid var(--border-color)' }}>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-inter font-semibold mb-1" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>Collection Date</label>
                      <input type="text" value={new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} readOnly className="soleria-input" style={{ background: 'var(--alt-surface)' }} />
                      <p className="mt-1 font-inter" style={{ fontSize: '11px', color: 'var(--secondary-text)' }}>Auto-set to today — date you collected the cheque</p>
                    </div>
                    <div>
                      <label className="block font-inter font-semibold mb-1" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>Cheque Date</label>
                      <input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} className="soleria-input" />
                      <p className="mt-1 font-inter" style={{ fontSize: '11px', color: 'var(--secondary-text)' }}>Date printed on the cheque</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="mb-5">
                <label className="block font-inter font-semibold mb-1" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>Description (optional)</label>
                <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Partial payment for slip SL-1040, advance for next order..." className="soleria-input" />
              </div>

              {/* Confirm */}
              <button onClick={handleConfirm} className="btn-gold" disabled={!canConfirm || submitting}>{submitting ? 'Confirming...' : 'Confirm Payment'}</button>
            </div>
          </>
        )}

        {activeTab === 'weekly' && (
          <>
            <div className="mb-4" data-no-print>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--secondary-text)' }} />
                <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search client name, phone, or method..." className="soleria-input pl-9" style={{ width: '100%', fontSize: '13px' }} />
              </div>
            </div>
            <PaymentListView
              payments={filteredWeekly}
              total={weeklyTotal}
              title="Weekly Payment Records"
              subtitle={`${getCurrentWeekStart().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${getCurrentWeekEnd().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            />
          </>
        )}

        {activeTab === 'monthly' && (
          <>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3" data-no-print>
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--secondary-text)' }} />
                <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search client name, phone, or method..." className="soleria-input pl-9" style={{ width: '100%', fontSize: '13px' }} />
              </div>
              <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="soleria-input" style={{ width: '100%', maxWidth: 180, fontSize: '13px' }} />
            </div>
            <PaymentListView
              payments={filteredMonthly}
              total={monthlyTotal}
              title="Monthly Payment Records"
              subtitle={new Date(monthFilter + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              showCount
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}

function PaymentListView({ payments, total, title, subtitle, showCount }: {
  payments: any[]; total: number; title: string; subtitle: string; showCount?: boolean;
}) {
  return (
    <div className="card-white">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 px-6 py-4" style={{ borderBottom: '2px solid var(--border-section)' }}>
        <div>
          <h4 className="font-lora font-semibold" style={{ fontSize: '18px', color: 'var(--dark-heading)' }}>{title}</h4>
          <p className="font-inter mt-1" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>{subtitle}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-inter uppercase font-semibold tracking-wider" style={{ fontSize: '11px', color: 'var(--secondary-text)', letterSpacing: '0.6px' }}>Total Collected</p>
          <p className="font-lora font-semibold" style={{ fontSize: '22px', color: 'var(--brand-gold)' }}>{formatCurrency(total)}</p>
        </div>
      </div>
      <div className="grid gap-4 px-6 py-2.5 soleria-table-header" style={{ gridTemplateColumns: '1fr 160px 170px 110px 120px' }}>
        <span>Client</span>
        <span>Phone</span>
        <span>Date</span>
        <span>Method</span>
        <span className="text-right">Amount</span>
      </div>
      {payments.map(p => (
        <div key={p.id} className="grid gap-4 px-6 py-3 soleria-table-row items-center print-row" style={{ gridTemplateColumns: '1fr 160px 170px 110px 120px' }}>
          <span className="font-inter font-semibold" style={{ fontSize: '13px', color: 'var(--dark-heading)' }}>{p.clientName}</span>
          <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>{p.clientPhone}</span>
          <div className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>
            {p.method === 'Cheque' && p.collectionDate && p.chequeDate ? (
              <>
                <div>Collected: {new Date(p.collectionDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div>Cheque: {new Date(p.chequeDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </>
            ) : (
              new Date(p.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
            )}
          </div>
          <span className="tag-pill text-center" style={{ fontSize: '11px' }}>{p.method}</span>
          <span className="text-right font-inter font-semibold" style={{ fontSize: '14px', color: 'var(--dark-heading)' }}>{formatCurrency(p.amount)}</span>
        </div>
      ))}
      {payments.length === 0 && (
        <div className="px-6 py-8 text-center font-inter" style={{ color: 'var(--muted-text)' }}>No payments found.</div>
      )}
      {showCount && payments.length > 0 && (
        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '2px solid var(--border-section)' }}>
          <span className="font-inter uppercase font-semibold tracking-wider" style={{ fontSize: '11px', color: 'var(--secondary-text)', letterSpacing: '0.6px' }}>{payments.length} Payments</span>
          <span className="font-lora font-semibold" style={{ fontSize: '22px', color: 'var(--brand-gold)' }}>{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  );
}
