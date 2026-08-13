import { useState, useMemo } from 'react';
import { useApp, formatCurrency, isDateInMonth, getMonthName } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';
import DonutChart from '@/components/DonutChart';
import { Printer } from 'lucide-react';

type TabType = 'monthly' | 'annual' | 'analytics';

export default function ProfitPage() {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [analyticsMonth, setAnalyticsMonth] = useState(new Date().getMonth());
  const [analyticsYear, setAnalyticsYear] = useState(new Date().getFullYear());

  const currentMonth = new Date().getMonth();

  // Calculate profit data
  const grossSales = useMemo(() => {
    return state.clients.flatMap(c => c.slips)
      .filter(s => isDateInMonth(s.date, selectedMonth, selectedYear))
      .reduce((sum, s) => sum + s.total, 0);
  }, [state, selectedMonth, selectedYear]);

  const operatingExpenses = useMemo(() => {
    return state.expenses
      .filter(e => isDateInMonth(e.date, selectedMonth, selectedYear))
      .reduce((sum, e) => sum + e.rows.reduce((rs, r) => rs + r.price, 0), 0);
  }, [state, selectedMonth, selectedYear]);

  const utilityBills = useMemo(() => {
    return state.bills
      .filter(b => isDateInMonth(b.date, selectedMonth, selectedYear))
      .reduce((sum, b) => sum + b.entries.reduce((es, e) => es + e.amount, 0), 0);
  }, [state, selectedMonth, selectedYear]);

  const chemicalCosts = useMemo(() => {
    return state.chemPurchases
      .filter(c => isDateInMonth(c.date, selectedMonth, selectedYear))
      .reduce((sum, c) => sum + c.cost, 0);
  }, [state, selectedMonth, selectedYear]);

  const totalExpenses = operatingExpenses + utilityBills + chemicalCosts;
  const netProfit = grossSales - totalExpenses;

  // Annual data
  const annualData = useMemo(() => {
    const months = [];
    for (let m = 0; m <= currentMonth; m++) {
      const sales = state.clients.flatMap(c => c.slips)
        .filter(s => isDateInMonth(s.date, m, selectedYear))
        .reduce((sum, s) => sum + s.total, 0);
      const opExp = state.expenses
        .filter(e => isDateInMonth(e.date, m, selectedYear))
        .reduce((sum, e) => sum + e.rows.reduce((rs, r) => rs + r.price, 0), 0);
      const utilBills = state.bills
        .filter(b => isDateInMonth(b.date, m, selectedYear))
        .reduce((sum, b) => sum + b.entries.reduce((es, e) => es + e.amount, 0), 0);
      const chemCost = state.chemPurchases
        .filter(c => isDateInMonth(c.date, m, selectedYear))
        .reduce((sum, c) => sum + c.cost, 0);
      const totalExp = opExp + utilBills + chemCost;
      months.push({ month: m, sales, expenses: totalExp, net: sales - totalExp });
    }
    return months;
  }, [state, selectedYear, currentMonth]);

  const yearTotalSales = annualData.reduce((s, m) => s + m.sales, 0);
  const yearTotalExpenses = annualData.reduce((s, m) => s + m.expenses, 0);
  const yearNetProfit = yearTotalSales - yearTotalExpenses;

  // Analytics data
  const analyticsMonthly = useMemo(() => {
    const opExp = state.expenses.filter(e => isDateInMonth(e.date, analyticsMonth, analyticsYear))
      .reduce((s, e) => s + e.rows.reduce((rs, r) => rs + r.price, 0), 0);
    const utilBills = state.bills.filter(b => isDateInMonth(b.date, analyticsMonth, analyticsYear))
      .reduce((s, b) => s + b.entries.reduce((es, e) => es + e.amount, 0), 0);
    const chemCost = state.chemPurchases.filter(c => isDateInMonth(c.date, analyticsMonth, analyticsYear))
      .reduce((s, c) => s + c.cost, 0);
    return { operating: opExp, bills: utilBills, chemical: chemCost };
  }, [state, analyticsMonth, analyticsYear]);

  const analyticsMonthlyGross = useMemo(() => {
    return state.clients.flatMap(c => c.slips)
      .filter(s => isDateInMonth(s.date, analyticsMonth, analyticsYear))
      .reduce((sum, s) => sum + s.total, 0);
  }, [state, analyticsMonth, analyticsYear]);

  const analyticsAnnualGross = useMemo(() => {
    return state.clients.flatMap(c => c.slips)
      .filter(s => new Date(s.date).getFullYear() === analyticsYear)
      .reduce((sum, s) => sum + s.total, 0);
  }, [state, analyticsYear]);

  const analyticsAnnual = useMemo(() => {
    const opExp = state.expenses.filter(e => new Date(e.date).getFullYear() === analyticsYear)
      .reduce((s, e) => s + e.rows.reduce((rs, r) => rs + r.price, 0), 0);
    const utilBills = state.bills.filter(b => new Date(b.date).getFullYear() === analyticsYear)
      .reduce((s, b) => s + b.entries.reduce((es, e) => es + e.amount, 0), 0);
    const chemCost = state.chemPurchases.filter(c => new Date(c.date).getFullYear() === analyticsYear)
      .reduce((s, c) => s + c.cost, 0);
    return { operating: opExp, bills: utilBills, chemical: chemCost };
  }, [state, analyticsYear]);

  function handlePrint() {
    const el = document.querySelector('.report-print') as HTMLElement | null;
    if (el) {
      const heightMm = Math.ceil(el.scrollHeight / 3.7795) + 15;
      const style = document.createElement('style');
      style.id = 'dynamic-print-page';
      style.textContent = `@page { size: 140mm ${heightMm}mm !important; margin: 5mm !important; }`;
      document.head.appendChild(style);
      window.print();
      document.head.removeChild(style);
    } else {
      window.print();
    }
  }

  return (
    <AppLayout
      pageTitle="Profit"
      headerAction={
        activeTab !== 'analytics' ? (
          <button onClick={handlePrint} className="btn-navy flex items-center gap-2">
            <Printer size={16} />
            Print Report
          </button>
        ) : undefined
      }
    >
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="tab-pill-container mb-6" data-no-print>
          <button onClick={() => setActiveTab('monthly')} className={activeTab === 'monthly' ? 'tab-pill-active' : 'tab-pill-inactive'}>Monthly</button>
          <button onClick={() => setActiveTab('annual')} className={activeTab === 'annual' ? 'tab-pill-active' : 'tab-pill-inactive'}>Annual</button>
          <button onClick={() => setActiveTab('analytics')} className={activeTab === 'analytics' ? 'tab-pill-active' : 'tab-pill-inactive'}>Analytics</button>
        </div>

        {activeTab === 'monthly' && (
          <>
            <div className="flex flex-col items-center gap-3 mb-6" data-no-print>
              <span className="font-lora font-semibold" style={{ fontSize: '22px', color: 'var(--dark-heading)' }}>
                {getMonthName(selectedMonth)} {selectedYear}
              </span>
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedMonth(m => { if (m === 0) { setSelectedYear(y => y - 1); return 11; } return m - 1; })} className="btn-outline" style={{ width: 36, height: 36 }}>&larr;</button>
                <input
                  type="month"
                  value={`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`}
                  onChange={e => {
                    const [y, m] = e.target.value.split('-').map(Number);
                    if (y && m) { setSelectedYear(y); setSelectedMonth(m - 1); }
                  }}
                  className="soleria-input"
                  style={{ width: 180 }}
                />
                <button onClick={() => setSelectedMonth(m => { if (m === 11) { setSelectedYear(y => y + 1); return 0; } return m + 1; })} className="btn-outline" style={{ width: 36, height: 36 }}>&rarr;</button>
              </div>
            </div>

            <div className="card-white report-print p-6" style={{ maxWidth: 620, margin: '0 auto' }}>
              <h3 className="font-lora font-semibold" style={{ fontSize: '22px', color: 'var(--dark-heading)' }}>Monthly Profit Report</h3>
              <p className="font-inter mt-1" style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>{getMonthName(selectedMonth)} {selectedYear}</p>
              <div style={{ borderBottom: '2px solid var(--border-section)', margin: '16px 0' }} />

              <div className="flex justify-between items-start py-3" style={{ borderBottom: '1px solid var(--border-table)' }}>
                <div>
                  <p className="font-inter uppercase font-semibold tracking-wider" style={{ fontSize: '12px', color: 'var(--secondary-text)', letterSpacing: '0.6px' }}>Gross Sales</p>
                  <p className="font-inter mt-1" style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>Total revenue for the month</p>
                </div>
                <span className="font-lora font-semibold" style={{ fontSize: '24px', color: 'var(--dark-heading)' }}>{formatCurrency(grossSales)}</span>
              </div>

              <div className="pt-4">
                <p className="font-inter uppercase font-semibold tracking-wider mb-2" style={{ fontSize: '12px', color: 'var(--secondary-text)', letterSpacing: '0.6px' }}>Expenses</p>
                <div className="flex justify-between items-center py-2">
                  <span className="font-inter font-medium" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>Operating Expenses</span>
                  <span className="font-inter" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>{formatCurrency(operatingExpenses)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="font-inter font-medium" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>Utility Bills</span>
                  <span className="font-inter" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>{formatCurrency(utilityBills)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="font-inter font-medium" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>Chemical</span>
                  <span className="font-inter" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>{formatCurrency(chemicalCosts)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-3" style={{ borderTop: '1px solid var(--border-table)', marginTop: 8 }}>
                <span className="font-inter font-semibold" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>Total Expenses</span>
                <span className="font-inter font-semibold" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>{formatCurrency(totalExpenses)}</span>
              </div>

              <div className="flex justify-between items-end pt-5" style={{ borderTop: '2px solid var(--border-section)', marginTop: 8 }}>
                <div>
                  <p className="font-inter uppercase font-semibold tracking-wider" style={{ fontSize: '12px', color: 'var(--secondary-text)', letterSpacing: '0.6px' }}>Net Profit</p>
                  <p className="font-inter mt-1" style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>Gross Sales – Total Expenses</p>
                </div>
                <span className="font-lora font-semibold" style={{ fontSize: '36px', color: 'var(--brand-gold)' }}>
                  {formatCurrency(netProfit)}
                </span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'annual' && (
          <>
            <div className="flex items-center justify-center gap-3 mb-6" data-no-print>
              <button onClick={() => setSelectedYear(y => y - 1)} className="btn-outline" style={{ width: 36, height: 36 }}>&larr;</button>
              <div className="card-white flex items-center justify-center font-lora font-semibold" style={{ width: 140, height: 42, fontSize: '20px', color: 'var(--dark-heading)' }}>
                {selectedYear}
              </div>
              <button onClick={() => setSelectedYear(y => y + 1)} className="btn-outline" style={{ width: 36, height: 36 }}>&rarr;</button>
            </div>

            <div className="card-white report-print" style={{ maxWidth: 620, margin: '0 auto', padding: 24 }}>
              <h3 className="font-lora font-semibold" style={{ fontSize: '22px', color: 'var(--dark-heading)' }}>Annual Profit Report</h3>
              <p className="font-inter mt-1" style={{ fontSize: '14px', color: 'var(--secondary-text)' }}>{selectedYear}</p>
              <div style={{ borderBottom: '2px solid var(--border-section)', margin: '16px 0' }} />

              <div className="grid gap-4 py-2 soleria-table-header" style={{ gridTemplateColumns: '110px 1fr 1fr 1fr' }}>
                <span>Month</span>
                <span className="text-right">Gross Sales</span>
                <span className="text-right">Expenses</span>
                <span className="text-right">Net Profit</span>
              </div>
              {annualData.map(d => (
                <div key={d.month} className="grid gap-4 py-3 items-center soleria-table-row" style={{ gridTemplateColumns: '110px 1fr 1fr 1fr' }}>
                  <span className="font-inter font-medium" style={{ fontSize: '15px', color: 'var(--primary-text)' }}>{getMonthName(d.month).slice(0, 3)}</span>
                  <span className="text-right font-inter" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>{formatCurrency(d.sales)}</span>
                  <span className="text-right font-inter" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>{formatCurrency(d.expenses)}</span>
                  <span className="text-right font-lora font-semibold" style={{ fontSize: '15px', color: d.net > 0 ? 'var(--brand-gold)' : d.net < 0 ? 'var(--error)' : 'var(--dark-heading)' }}>{formatCurrency(d.net)}</span>
                </div>
              ))}
              <div className="grid gap-4 py-4 items-center" style={{ gridTemplateColumns: '110px 1fr 1fr 1fr', borderTop: '2px solid var(--border-section)' }}>
                <span className="font-inter uppercase font-semibold tracking-wider" style={{ fontSize: '12px', color: 'var(--secondary-text)', letterSpacing: '0.6px' }}>Total</span>
                <span className="text-right font-lora font-semibold" style={{ fontSize: '19px', color: 'var(--dark-heading)' }}>{formatCurrency(yearTotalSales)}</span>
                <span className="text-right font-lora font-semibold" style={{ fontSize: '19px', color: 'var(--dark-heading)' }}>{formatCurrency(yearTotalExpenses)}</span>
                <span className="text-right font-lora font-semibold" style={{ fontSize: '19px', color: yearNetProfit > 0 ? 'var(--brand-gold)' : yearNetProfit < 0 ? 'var(--error)' : 'var(--dark-heading)' }}>{formatCurrency(yearNetProfit)}</span>
              </div>
            </div>
          </>
        )}

        {activeTab === 'analytics' && (
          <>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <label className="font-inter font-semibold" style={{ fontSize: '13px', color: 'var(--dark-heading)' }}>Year</label>
                <select value={analyticsYear} onChange={e => setAnalyticsYear(parseInt(e.target.value))} className="soleria-input" style={{ width: 100, fontSize: '13px' }}>
                  {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="font-inter font-semibold" style={{ fontSize: '13px', color: 'var(--dark-heading)' }}>Month</label>
                <select value={analyticsMonth} onChange={e => setAnalyticsMonth(parseInt(e.target.value))} className="soleria-input" style={{ width: 140, fontSize: '13px' }}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>{getMonthName(i)}</option>
                  ))}
                </select>
              </div>
            </div>

            {(() => {
              const monthlyExpTotal = analyticsMonthly.operating + analyticsMonthly.bills + analyticsMonthly.chemical;
              const monthlyNet = analyticsMonthlyGross - monthlyExpTotal;
              const annualExpTotal = analyticsAnnual.operating + analyticsAnnual.bills + analyticsAnnual.chemical;
              const annualNet = analyticsAnnualGross - annualExpTotal;
              return (
                <div className="flex flex-col gap-6">
                  <div className="card-white p-6">
                    <h4 className="font-lora font-semibold mb-6" style={{ fontSize: '18px', color: 'var(--dark-heading)' }}>
                      Monthly Breakdown
                    </h4>
                    <DonutChart
                      periodLabel={`${getMonthName(analyticsMonth).slice(0, 3)} ${analyticsYear}`}
                      grossSales={analyticsMonthlyGross}
                      data={analyticsMonthly}
                      net={monthlyNet}
                    />
                  </div>

                  <div className="card-white p-6">
                    <h4 className="font-lora font-semibold mb-6" style={{ fontSize: '18px', color: 'var(--dark-heading)' }}>
                      Annual Breakdown
                    </h4>
                    <DonutChart
                      periodLabel={`${analyticsYear}`}
                      grossSales={analyticsAnnualGross}
                      data={analyticsAnnual}
                      net={annualNet}
                    />
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </AppLayout>
  );
}
