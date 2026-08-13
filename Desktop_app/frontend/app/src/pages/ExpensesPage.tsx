import { useState } from 'react';
import { useApp, formatCurrency, isDateInCurrentWeek, isDateInCurrentMonth, getCurrentWeekStart, getCurrentWeekEnd } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';
import { Plus, Printer } from 'lucide-react';
import { createExpense, getExpenses } from '@/lib/expenses';

type TabType = 'new' | 'weekly' | 'monthly' | 'alltime';

export default function ExpensesPage() {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('new');
  const [entries, setEntries] = useState([{ desc: '', price: 0 }]);
  const [successMsg, setSuccessMsg] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filterText, setFilterText] = useState('');

  const runningTotal = entries.reduce((s, e) => s + (e.price || 0), 0);

  const weeklyExpenses = state.expenses.filter(e => isDateInCurrentWeek(e.date));
  const monthlyExpenses = state.expenses.filter(e => isDateInCurrentMonth(e.date));

  function addEntry() {
    setEntries([...entries, { desc: '', price: 0 }]);
  }

  function updateEntry(idx: number, updates: Partial<{ desc: string; price: number }>) {
    setEntries(entries.map((e, i) => i === idx ? { ...e, ...updates } : e));
  }

  function removeEntry(idx: number) {
    setEntries(entries.filter((_, i) => i !== idx));
  }

  async function handleConfirm() {
    const valid = entries.filter(e => e.desc.trim() && e.price > 0);
    if (valid.length === 0) return;
    setFormError('');
    setSubmitting(true);
    try {
      await createExpense(valid.map(e => ({ desc: e.desc, price: e.price })));
      const expenses = await getExpenses();
      dispatch({ type: 'SET_EXPENSES', expenses });
      setEntries([{ desc: '', price: 0 }]);
      setSuccessMsg('Expenses recorded successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to record expenses. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout
      pageTitle="Expenses"
      headerAction={
        activeTab !== 'new' ? (
          <button onClick={() => window.print()} className="btn-navy flex items-center gap-2">
            <Printer size={16} />
            Print Expenses
          </button>
        ) : undefined
      }
    >
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="tab-pill-container mb-6" data-no-print>
          <button onClick={() => setActiveTab('new')} className={activeTab === 'new' ? 'tab-pill-active' : 'tab-pill-inactive'}>New Entry</button>
          <button onClick={() => setActiveTab('weekly')} className={activeTab === 'weekly' ? 'tab-pill-active' : 'tab-pill-inactive'}>Weekly</button>
          <button onClick={() => setActiveTab('monthly')} className={activeTab === 'monthly' ? 'tab-pill-active' : 'tab-pill-inactive'}>Monthly</button>
          <button onClick={() => setActiveTab('alltime')} className={activeTab === 'alltime' ? 'tab-pill-active' : 'tab-pill-inactive'}>All Time</button>
        </div>

        {activeTab === 'new' && (
          <>
            {successMsg && <div className="banner-success rounded-lg px-4 py-3 text-sm mb-4">{successMsg}</div>}
            {formError && <div className="banner-error rounded-lg px-4 py-3 text-sm mb-4">{formError}</div>}
            <div className="card-white">
              <div className="grid gap-3 px-5 py-3 soleria-table-header" style={{ gridTemplateColumns: '1fr 140px 36px', background: 'var(--app-bg)' }}>
                <span>Description</span>
                <span className="text-right">Amount (Rs)</span>
                <span />
              </div>
              {entries.map((entry, idx) => (
                <div key={idx} className="grid gap-3 px-5 py-2.5 items-center soleria-table-row" style={{ gridTemplateColumns: '1fr 140px 36px' }}>
                  <input type="text" value={entry.desc} onChange={e => updateEntry(idx, { desc: e.target.value })} placeholder="e.g. Shop Rent" className="soleria-input" />
                  <input type="number" min={0} value={entry.price || ''} onChange={e => updateEntry(idx, { price: parseInt(e.target.value) || 0 })} placeholder="0" className="soleria-input text-right" />
                  {entries.length > 1 && <button onClick={() => removeEntry(idx)} style={{ color: 'var(--error)' }}>&times;</button>}
                </div>
              ))}
              <div className="px-5 py-3">
                <button onClick={addEntry} className="btn-dashed flex items-center gap-1 text-sm"><Plus size={14} /> Add Expense</button>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handleConfirm} className="btn-gold" disabled={runningTotal <= 0 || submitting}>{submitting ? 'Confirming...' : 'Confirm'}</button>
            </div>
          </>
        )}

        {activeTab === 'weekly' && (
          <ReportView
            expenses={weeklyExpenses}
            title="Weekly Expenses"
            subtitle={`${getCurrentWeekStart().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} – ${getCurrentWeekEnd().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`}
            emptyText="No expenses recorded this week."
            filterText={filterText}
            setFilterText={setFilterText}
          />
        )}
        {activeTab === 'monthly' && (
          <ReportView
            expenses={monthlyExpenses}
            title="Monthly Expenses"
            subtitle={new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            emptyText="No expenses recorded this month."
            filterText={filterText}
            setFilterText={setFilterText}
          />
        )}
        {activeTab === 'alltime' && (
          <ReportView
            expenses={state.expenses}
            title="All Time Expenses"
            subtitle="Complete expense history"
            emptyText="No expenses recorded."
            grandTotal
            filterText={filterText}
            setFilterText={setFilterText}
          />
        )}
      </div>
    </AppLayout>
  );
}

function ReportView({ expenses, title, subtitle, emptyText, grandTotal, filterText, setFilterText }: {
  expenses: any[];
  title: string;
  subtitle?: string;
  emptyText?: string;
  grandTotal?: boolean;
  filterText: string;
  setFilterText: (s: string) => void;
}) {
  const filtered = expenses.filter(e => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    const dateLabel = new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase();
    const descMatch = e.rows.some((r: any) => r.desc.toLowerCase().includes(q));
    return e.date.toLowerCase().includes(q) || dateLabel.includes(q) || descMatch;
  });
  const total = filtered.reduce((s, e) => s + e.rows.reduce((rs: number, r: any) => rs + r.price, 0), 0);
  return (
    <>
      <div className="mb-4" style={{ maxWidth: 380 }} data-no-print>
        <input
          type="text"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="Filter by month, date, or description..."
          className="soleria-input"
          style={{ fontSize: '14px', width: '100%' }}
        />
      </div>
      <div className="card-white">
        <div className="px-6 py-4" style={{ borderBottom: '2px solid var(--border-section)' }}>
          <h3 className="font-lora font-semibold" style={{ fontSize: '20px', color: 'var(--dark-heading)' }}>{title}</h3>
          {subtitle && <p className="font-inter mt-1" style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>{subtitle}</p>}
        </div>
        {filtered.map(expense => {
          const expTotal = expense.rows.reduce((s: number, r: any) => s + r.price, 0);
          return (
            <div key={expense.id} className="px-6 py-3 soleria-table-row print-row">
              <div className="flex items-center justify-between mb-2">
                <span className="font-inter font-medium" style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>
                  {new Date(expense.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {expense.time}
                </span>
                <span className="font-lora font-semibold" style={{ fontSize: '16px', color: 'var(--brand-gold)' }}>{formatCurrency(expTotal)}</span>
              </div>
              {expense.rows.map((row: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-1">
                  <span className="font-inter font-medium" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>{row.desc}</span>
                  <span className="font-inter font-medium" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>{formatCurrency(row.price)}</span>
                </div>
              ))}
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="px-6 py-8 text-center font-inter" style={{ fontSize: '15px', color: 'var(--muted-text)' }}>{expenses.length === 0 ? (emptyText || 'No expenses found.') : 'No expenses match your filter.'}</div>
        ) : (
          <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '2px solid var(--border-section)' }}>
            <span className="font-inter uppercase font-semibold tracking-wider" style={{ fontSize: '13px', color: 'var(--secondary-text)', letterSpacing: '0.6px' }}>{grandTotal ? 'Grand Total' : 'Total Expenses'}</span>
            <span className="font-lora font-semibold" style={{ fontSize: '28px', color: 'var(--brand-gold)' }}>{formatCurrency(total)}</span>
          </div>
        )}
      </div>
    </>
  );
}
