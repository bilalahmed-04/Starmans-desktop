import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';
import { Search, X } from 'lucide-react';
import { deleteArticle, getArticles } from '@/lib/articles';
import { getProductions } from '@/lib/productions';

const LOW_STOCK_THRESHOLD = 20;

export default function StockPage() {
  const { state, dispatch } = useApp();
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [maxStock, setMaxStock] = useState('');
  const [error, setError] = useState('');

  const colors = Array.from(new Set(state.articles.map(a => a.color).filter(Boolean))).sort();

  const filtered = state.articles.filter(a => {
    if (!a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (colorFilter && a.color !== colorFilter) return false;
    if (maxStock !== '' && !(a.stock <= Number(maxStock))) return false;
    return true;
  });

  async function handleDelete(article: typeof state.articles[0]) {
    if (!window.confirm(`Remove ${article.name} from inventory? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteArticle(article.id);
      const [articles, productions] = await Promise.all([getArticles(), getProductions()]);
      dispatch({ type: 'SET_ARTICLES', articles });
      dispatch({ type: 'SET_PRODUCTIONS', productions });
    } catch {
      setError(`Failed to delete ${article.name}. Please try again.`);
    }
  }

  return (
    <AppLayout pageTitle="Stock">
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="relative" style={{ width: 220 }}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--secondary-text)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search articles..."
              className="soleria-input pl-9"
              style={{ fontSize: '13px' }}
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={colorFilter}
              onChange={e => setColorFilter(e.target.value)}
              className="soleria-input cursor-pointer"
              style={{ width: 140, fontSize: '13px' }}
            >
              <option value="">All Colors</option>
              {colors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="number"
              min={0}
              value={maxStock}
              onChange={e => setMaxStock(e.target.value)}
              placeholder="Stock below..."
              className="soleria-input"
              style={{ width: 130, fontSize: '13px' }}
            />
            {(colorFilter || maxStock !== '') && (
              <button
                onClick={() => { setColorFilter(''); setMaxStock(''); }}
                className="btn-outline text-xs"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="banner-error rounded-lg px-3 py-2 mb-3 text-sm">{error}</div>
        )}

        <p className="mb-4 font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>
          {state.articles.length} articles in inventory
          {state.articles.filter(a => a.stock < LOW_STOCK_THRESHOLD).length > 0 && (
            <span> — {state.articles.filter(a => a.stock < LOW_STOCK_THRESHOLD).length} below threshold</span>
          )}
        </p>

        {/* Table */}
        <div className="card-white">
          <div
            className="grid gap-4 px-5 py-3 soleria-table-header"
            style={{ gridTemplateColumns: '1fr 110px 110px 80px 44px', background: 'var(--app-bg)' }}
          >
            <span>Article</span>
            <span>Color</span>
            <span>Size</span>
            <span className="text-right">In Stock</span>
            <span />
          </div>

          {filtered.map(article => {
            const isLow = article.stock < LOW_STOCK_THRESHOLD;
            return (
              <div
                key={article.id}
                className="grid gap-4 px-5 py-3 items-center soleria-table-row"
                style={{ gridTemplateColumns: '1fr 110px 110px 80px 44px' }}
              >
                <div>
                  <span className="font-inter font-medium" style={{ fontSize: '14px', color: 'var(--primary-text)' }}>
                    {article.name}
                  </span>
                  {isLow && (
                    <div className="mt-0.5 font-inter font-semibold" style={{ fontSize: '11px', color: 'var(--error)' }}>
                      Low stock
                    </div>
                  )}
                </div>
                <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>
                  {article.color}
                </span>
                <span className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>
                  {article.size}
                </span>
                <span
                  className="text-right font-inter font-bold"
                  style={{ fontSize: '16px', color: isLow ? 'var(--error)' : 'var(--primary-text)' }}
                >
                  {article.stock}
                </span>
                <button
                  onClick={() => handleDelete(article)}
                  className="flex items-center justify-center rounded-md transition-colors"
                  style={{ width: 28, height: 28, border: '1px solid var(--border-color)', color: 'var(--error)' }}
                  title="Remove article"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center font-inter" style={{ color: 'var(--muted-text)', fontSize: '13px' }}>
              No articles found.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
