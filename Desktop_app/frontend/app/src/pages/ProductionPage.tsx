import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';
import { Plus, Printer } from 'lucide-react';
import { createArticle, getArticles } from '@/lib/articles';
import { createProduction, getProductions } from '@/lib/productions';

type TabType = 'daily' | 'weekly' | 'monthly';

function getIsoWeekValue(date = new Date()): string {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getMonthValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isDateInSelectedWeek(dateStr: string, weekValue: string): boolean {
  const [yearText, weekText] = weekValue.split('-W');
  const year = Number(yearText);
  const week = Number(weekText);
  if (!year || !week) return false;

  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - (januaryFourth.getUTCDay() || 7) + 1 + ((week - 1) * 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const productionDate = new Date(`${dateStr}T00:00:00Z`);
  return productionDate >= monday && productionDate <= sunday;
}

export default function ProductionPage() {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('daily');
  const today = new Date();
  const prodDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [showNewArticle, setShowNewArticle] = useState(false);
  const [newArticleError, setNewArticleError] = useState('');
  const [newArticleName, setNewArticleName] = useState('');
  const [newArticleColor, setNewArticleColor] = useState('');
  const [newArticleSize, setNewArticleSize] = useState('');
  const [newArticleStock, setNewArticleStock] = useState('');
  const [productionError, setProductionError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(getIsoWeekValue);
  const [selectedMonth, setSelectedMonth] = useState(getMonthValue);

  const weeklyProductions = state.productions.filter(p => isDateInSelectedWeek(p.date, selectedWeek));
  const monthlyProductions = state.productions.filter(p => p.date.slice(0, 7) === selectedMonth);

  async function handleConfirmProduction() {
    const entries = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([articleId, qty]) => ({
        articleId,
        articleName: state.articles.find(a => a.id === articleId)?.name || '',
        qty
      }));

    if (entries.length === 0) return;

    setProductionError('');
    setConfirming(true);
    try {
      await createProduction(prodDate, entries);
      const [articles, productions] = await Promise.all([getArticles(), getProductions()]);
      dispatch({ type: 'SET_ARTICLES', articles });
      dispatch({ type: 'SET_PRODUCTIONS', productions });
      setQuantities({});
      setSuccessMsg('Production confirmed! Stock updated.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setProductionError(err instanceof Error ? err.message : 'Failed to confirm production. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  async function handleAddNewArticle() {
    const openingQty = parseInt(newArticleStock) || 0;
    if (!newArticleName.trim() || !/^\d+(?:-\d+)*$/.test(newArticleSize) || openingQty <= 0) return;
    setNewArticleError('');
    try {
      const article = await createArticle({
        name: newArticleName,
        color: newArticleColor,
        size: newArticleSize,
      });
      await createProduction(prodDate, [{ articleId: article.id, articleName: article.name, qty: openingQty }]);
      const [articles, productions] = await Promise.all([getArticles(), getProductions()]);
      dispatch({ type: 'SET_ARTICLES', articles });
      dispatch({ type: 'SET_PRODUCTIONS', productions });
      setNewArticleName('');
      setNewArticleColor('');
      setNewArticleSize('');
      setNewArticleStock('');
      setShowNewArticle(false);
    } catch {
      setNewArticleError('Failed to add article. Please try again.');
    }
  }

  const weeklyTotals: Record<string, number> = {};
  weeklyProductions.forEach(p => {
    p.entries.forEach(e => {
      weeklyTotals[e.articleName] = (weeklyTotals[e.articleName] || 0) + e.qty;
    });
  });

  const monthlyTotals: Record<string, number> = {};
  monthlyProductions.forEach(p => {
    p.entries.forEach(e => {
      monthlyTotals[e.articleName] = (monthlyTotals[e.articleName] || 0) + e.qty;
    });
  });

  const weeklyGrand = Object.values(weeklyTotals).reduce((s, v) => s + v, 0);
  const monthlyGrand = Object.values(monthlyTotals).reduce((s, v) => s + v, 0);

  return (
    <AppLayout
      pageTitle="Production"
      headerAction={
        activeTab !== 'daily' ? (
          <button onClick={() => window.print()} className="btn-navy flex items-center gap-2">
            <Printer size={16} />
            Print Production
          </button>
        ) : undefined
      }
    >
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="tab-pill-container mb-6">
          <button onClick={() => setActiveTab('daily')} className={activeTab === 'daily' ? 'tab-pill-active' : 'tab-pill-inactive'}>Daily</button>
          <button onClick={() => setActiveTab('weekly')} className={activeTab === 'weekly' ? 'tab-pill-active' : 'tab-pill-inactive'}>Weekly</button>
          <button onClick={() => setActiveTab('monthly')} className={activeTab === 'monthly' ? 'tab-pill-active' : 'tab-pill-inactive'}>Monthly</button>
        </div>

        {activeTab === 'daily' && (
          <>
            {successMsg && <div className="banner-success rounded-lg px-4 py-3 text-sm mb-4">{successMsg}</div>}
            {productionError && <div className="banner-error rounded-lg px-4 py-3 text-sm mb-4">{productionError}</div>}

            <div className="flex items-center gap-3 mb-4">
              <label className="font-inter font-semibold" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>Date</label>
              <span className="font-inter" style={{ fontSize: '13px', color: 'var(--primary-text)' }}>
                {today.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>

            <div className="card-white mb-4">
              <div className="grid gap-4 px-5 py-3 soleria-table-header" style={{ gridTemplateColumns: '1fr 110px 110px 130px', background: 'var(--app-bg)' }}>
                <span>Article</span>
                <span>Color</span>
                <span>Size</span>
                <span className="text-right">Qty Produced</span>
              </div>

              {state.articles.map(article => (
                <div key={article.id} className="grid gap-4 px-5 py-3 items-center soleria-table-row" style={{ gridTemplateColumns: '1fr 110px 110px 130px' }}>
                  <span className="font-inter font-medium" style={{ fontSize: '14px', color: 'var(--primary-text)' }}>{article.name}</span>
                  <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>{article.color}</span>
                  <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>{article.size}</span>
                  <input
                    type="number"
                    min={0}
                    value={quantities[article.id] || ''}
                    onChange={e => setQuantities({ ...quantities, [article.id]: parseInt(e.target.value) || 0 })}
                    className="soleria-input text-right"
                    style={{ fontSize: '13px' }}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setShowNewArticle(!showNewArticle)} className="btn-dashed flex items-center gap-2 text-xs">
                <Plus size={14} /> New Article
              </button>
              <button onClick={handleConfirmProduction} className="btn-gold" disabled={confirming}>
                {confirming ? 'Confirming...' : 'Confirm Production'}
              </button>
            </div>

            {showNewArticle && (
              <div className="card-white mt-4 p-4">
                <h4 className="font-lora font-semibold mb-3" style={{ fontSize: '16px', color: 'var(--dark-heading)' }}>Add New Article</h4>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                  <input type="text" value={newArticleName} onChange={e => setNewArticleName(e.target.value)} placeholder="Article Name" className="soleria-input" style={{ width: '100%', minWidth: 0 }} />
                  <input type="text" value={newArticleColor} onChange={e => setNewArticleColor(e.target.value)} placeholder="Color" className="soleria-input" style={{ width: '100%', minWidth: 0 }} />
                  <input
                    type="text"
                    value={newArticleSize}
                    onChange={e => {
                      if (/^[0-9-]*$/.test(e.target.value)) setNewArticleSize(e.target.value);
                    }}
                    placeholder="Size"
                    className="soleria-input"
                    style={{ width: '100%', minWidth: 0 }}
                  />
                  <input type="number" value={newArticleStock} onChange={e => setNewArticleStock(e.target.value)} placeholder="Opening Qty" className="soleria-input" style={{ width: '100%', minWidth: 0 }} />
                </div>
                {newArticleError && (
                  <div className="banner-error rounded-lg px-3 py-2 mt-3 text-sm">{newArticleError}</div>
                )}
                <button onClick={handleAddNewArticle} className="btn-gold mt-3">Add Article</button>
              </div>
            )}
          </>
        )}

        {activeTab === 'weekly' && (
          <>
            <div className="mb-4 flex justify-end" data-no-print>
              <input
                type="week"
                value={selectedWeek}
                onChange={event => { if (event.target.value) setSelectedWeek(event.target.value); }}
                className="soleria-input"
                style={{ width: 180, fontSize: '13px' }}
                aria-label="Filter production by week"
              />
            </div>
            <ProductionReport totals={weeklyTotals} grandTotal={weeklyGrand} title={`Weekly Production Report — ${selectedWeek}`} />
          </>
        )}

        {activeTab === 'monthly' && (
          <>
            <div className="mb-4 flex justify-end" data-no-print>
              <input
                type="month"
                value={selectedMonth}
                onChange={event => { if (event.target.value) setSelectedMonth(event.target.value); }}
                className="soleria-input"
                style={{ width: 180, fontSize: '13px' }}
                aria-label="Filter production by month"
              />
            </div>
            <ProductionReport
              totals={monthlyTotals}
              grandTotal={monthlyGrand}
              title={`Monthly Production Report — ${new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}

function ProductionReport({ totals, grandTotal, title }: { totals: Record<string, number>; grandTotal: number; title: string }) {
  const { state } = useApp();
  const entries = Object.entries(totals);

  return (
    <div className="card-white">
      <div className="px-6 py-4" style={{ borderBottom: '2px solid var(--border-section)' }}>
        <h3 className="font-lora font-semibold" style={{ fontSize: '18px', color: 'var(--dark-heading)' }}>{title}</h3>
      </div>
      <div className="grid gap-4 px-6 py-3 soleria-table-header" style={{ gridTemplateColumns: '1fr 110px 110px 130px', background: 'var(--app-bg)' }}>
        <span>Article</span>
        <span>Color</span>
        <span>Size</span>
        <span className="text-right">Produced</span>
      </div>
      {entries.map(([name, qty]) => {
        const article = state.articles.find(a => a.name === name);
        return (
          <div key={name} className="grid gap-4 px-6 py-3 soleria-table-row items-center" style={{ gridTemplateColumns: '1fr 110px 110px 130px' }}>
            <span className="font-inter font-medium" style={{ fontSize: '14px', color: 'var(--primary-text)' }}>{name}</span>
            <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>{article?.color || '-'}</span>
            <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>{article?.size || '-'}</span>
            <span className="text-right font-inter font-semibold" style={{ fontSize: '14px', color: 'var(--primary-text)' }}>{qty}</span>
          </div>
        );
      })}
      {entries.length === 0 && (
        <div className="px-6 py-8 text-center font-inter" style={{ color: 'var(--muted-text)' }}>No production records found.</div>
      )}
      <div className="flex justify-between items-center px-6 py-4" style={{ borderTop: '2px solid var(--border-section)' }}>
        <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>Total Produced</span>
        <span className="font-lora font-semibold" style={{ fontSize: '26px', color: 'var(--brand-gold)' }}>{grandTotal} pairs</span>
      </div>
    </div>
  );
}
