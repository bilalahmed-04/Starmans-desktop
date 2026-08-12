import { useState } from 'react';
import { useApp, formatCurrency } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';
import { Printer, ArrowLeft, Pencil, Trash2, X, Plus } from 'lucide-react';
import type { SlipItem } from '@/types';
import { updateSlip, deleteSlip, getClients } from '@/lib/slips';
import { getArticles } from '@/lib/articles';
import SearchableSelect from '@/components/SearchableSelect';

function calcItemTotal(item: SlipItem): number {
  const subtotal = item.qty * item.price;
  let discount = 0;
  if (item.discountType === '%') {
    discount = subtotal * (item.discountPct / 100);
  } else if (item.discountType === 'Rs') {
    discount = item.discountAmount;
  }
  return Math.max(0, subtotal - discount);
}

export default function SlipDetailPage() {
  const { state, dispatch } = useApp();

  const client = state.clients.find(item => item.id === state.selectedClientId);
  const slip = client?.slips.find(item => item.id === state.selectedSlipId);

  const [isEditing, setIsEditing] = useState(false);
  const [editItems, setEditItems] = useState<SlipItem[]>([]);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  function navigate(page: string) {
    dispatch({ type: 'NAVIGATE', page });
  }

  function handlePrint() {
    const el = document.querySelector('.invoice-print') as HTMLElement | null;
    if (el) {
      const heightMm = Math.ceil(el.scrollHeight / 3.7795) + 15;
      const style = document.createElement('style');
      style.id = 'dynamic-print-page';
      style.textContent = `@page { size: 100mm ${heightMm}mm !important; margin: 5mm !important; }`;
      document.head.appendChild(style);
      window.print();
      document.head.removeChild(style);
    } else {
      window.print();
    }
  }

  async function handleDelete() {
    if (!slip) return;
    if (!window.confirm('Delete this slip? Stock will be restored.')) return;
    setDeleteError('');
    setDeleting(true);
    try {
      await deleteSlip(slip.id);
      const [articles, clients] = await Promise.all([getArticles(), getClients()]);
      dispatch({ type: 'SET_ARTICLES', articles });
      dispatch({ type: 'SET_CLIENTS', clients });
      navigate('client-detail');
    } catch {
      setDeleteError('Failed to delete slip. Please try again.');
      setDeleting(false);
    }
  }

  function startEdit() {
    if (!slip) return;
    setEditItems(slip.items.map(it => ({ ...it })));
    setEditError('');
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditError('');
  }

  function updateItem(idx: number, updates: Partial<SlipItem>) {
    setEditError('');
    setEditItems(items => items.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, ...updates };
      updated.subtotal = updated.qty * updated.price;
      updated.amount = calcItemTotal(updated);
      return updated;
    }));
  }

  function addItem() {
    setEditItems(items => [...items, { name: '', qty: 1, price: 0, subtotal: 0, discountType: '%', discountAmount: 0, discountPct: 0, amount: 0, desc: '', size: '', color: '' }]);
  }

  function removeItem(idx: number) {
    setEditItems(items => items.length <= 1 ? items : items.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!slip) return;

    for (const item of editItems) {
      const discount = item.discountType === '%' ? item.discountPct : item.discountAmount;
      if (item.name && !state.articles.some(a => a.name === item.name)) {
        setEditError(`"${item.name}" was removed from stock. Please select a replacement article for that row.`);
        return;
      }
      if (!item.name || !item.size.trim() || !item.color.trim()) {
        setEditError('Article, size, and color are required for every item.');
        return;
      }
      if (!Number.isInteger(item.qty) || item.qty <= 0 || !Number.isInteger(item.price) || item.price <= 0) {
        setEditError('Quantity and price must be positive whole numbers.');
        return;
      }
      if (!/^\d+(?:-\d+)*$/.test(item.size)) {
        setEditError('Size may contain only whole numbers and hyphens (for example, 42-44).');
        return;
      }
      if (!item.discountType || !Number.isInteger(discount) || discount < 0) {
        setEditError('Discount must be a whole number.');
        return;
      }
      if (item.discountType === '%' && discount > 100) {
        setEditError('Percentage discount cannot exceed 100.');
        return;
      }
    }

    setEditError('');
    setSaving(true);
    try {
      await updateSlip(slip.id, editItems);
      const [articles, clients] = await Promise.all([getArticles(), getClients()]);
      dispatch({ type: 'SET_ARTICLES', articles });
      dispatch({ type: 'SET_CLIENTS', clients });
      setIsEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update slip. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!slip || !client) return null;

  const editGrandTotal = editItems.reduce((sum, it) => sum + calcItemTotal(it), 0);

  return (
    <AppLayout
      pageTitle={`Invoice ${slip.no}`}
      headerAction={
        !isEditing ? (
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="btn-gold flex items-center gap-2">
              <Printer size={16} />
              Print
            </button>
          </div>
        ) : undefined
      }
    >
      <div style={{ maxWidth: isEditing ? 860 : 500, margin: '0 auto' }}>
        {/* Action bar */}
        <div className="flex items-center gap-2 mb-4" data-no-print>
          <button onClick={() => navigate('client-detail')} className="btn-outline flex items-center gap-1 text-xs">
            <ArrowLeft size={14} /> Back
          </button>
          {!isEditing && (
            <>
              <button onClick={startEdit} className="btn-outline flex items-center gap-1 text-xs">
                <Pencil size={14} /> Edit
              </button>
              <button onClick={handleDelete} className="btn-danger flex items-center gap-1 text-xs" disabled={deleting}>
                <Trash2 size={14} /> {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </>
          )}
        </div>
        {deleteError && (
          <div className="banner-error rounded-lg px-4 py-3 text-sm mb-4" data-no-print>{deleteError}</div>
        )}

        {isEditing ? (
          <div className="card-white">
            {editError && (
              <div className="banner-error rounded-lg px-4 py-3 text-sm m-5 mb-0">{editError}</div>
            )}

            <div
              className="grid gap-3 px-5 py-3 soleria-table-header"
              style={{ gridTemplateColumns: '210px 48px 120px 180px 100px 30px', background: 'var(--app-bg)' }}
            >
              <span>Article</span>
              <span>Qty</span>
              <span>Price</span>
              <span style={{ justifySelf: 'center' }}>Discount</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            {editItems.map((item, idx) => {
              const article = state.articles.find(a => a.name === item.name);
              const articleRemoved = Boolean(item.name) && !article;
              const requestedArticleQty = editItems
                .filter(row => row.name === item.name)
                .reduce((total, row) => total + row.qty, 0);
              const originalQty = slip.items
                .filter(row => row.name === item.name)
                .reduce((total, row) => total + row.qty, 0);
              const availableForEdit = (article?.stock ?? 0) + originalQty;
              const stockExceeded = articleRemoved || Boolean(article && requestedArticleQty > availableForEdit);

              const sizeOptions = Array.from(new Set(
                state.articles
                  .filter(a => a.name === item.name && (!item.color || a.color === item.color))
                  .map(a => a.size)
                  .filter(Boolean)
              )).sort();
              const colorOptions = Array.from(new Set(
                state.articles
                  .filter(a => a.name === item.name && (!item.size || a.size === item.size))
                  .map(a => a.color)
                  .filter(Boolean)
              )).sort();

              return (
                <div key={idx} className="soleria-table-row">
                  <div className="grid gap-3 px-5 py-3 items-start" style={{ gridTemplateColumns: '210px 48px 120px 180px 100px 30px' }}>
                    <div>
                      <select
                        value={item.name}
                        onChange={e => updateItem(idx, { name: e.target.value, size: '', color: '' })}
                        className="soleria-input cursor-pointer"
                        style={{ fontSize: '13px', width: '100%' }}
                      >
                        <option value="">Select article...</option>
                        {articleRemoved && (
                          <option value={item.name}>{item.name} (removed from stock)</option>
                        )}
                        {state.articles.map(a => (
                          <option key={a.id} value={a.name}>{a.name}</option>
                        ))}
                      </select>
                      {articleRemoved ? (
                        <div className="mt-1" style={{ fontSize: '10px', color: 'var(--error)' }}>
                          This article was removed from stock — please select a replacement.
                        </div>
                      ) : stockExceeded && (
                        <div className="mt-1 whitespace-nowrap" style={{ fontSize: '10px', color: 'var(--error)' }}>
                          Only {availableForEdit} available
                        </div>
                      )}
                    </div>

                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.qty || ''}
                      onChange={e => updateItem(idx, { qty: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="soleria-input text-center"
                      style={{ width: '100%', fontSize: '13px', borderColor: stockExceeded ? 'var(--error)' : undefined }}
                    />

                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={item.price || ''}
                      onChange={e => updateItem(idx, { price: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="soleria-input text-right"
                      style={{ fontSize: '13px' }}
                    />

                    <div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex overflow-hidden rounded-md">
                          <button
                            type="button"
                            onClick={() => updateItem(idx, { discountType: item.discountType === '%' ? null : '%' })}
                            className={item.discountType === '%' ? 'discount-toggle-active' : 'discount-toggle-inactive'}
                          >
                            %
                          </button>
                          <button
                            type="button"
                            onClick={() => updateItem(idx, { discountType: item.discountType === 'Rs' ? null : 'Rs' })}
                            className={item.discountType === 'Rs' ? 'discount-toggle-active' : 'discount-toggle-inactive'}
                          >
                            Rs
                          </button>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          max={item.discountType === '%' ? 100 : undefined}
                          value={item.discountType === '%' ? item.discountPct : item.discountAmount}
                          onFocus={event => event.currentTarget.select()}
                          onChange={e => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            if (item.discountType === '%') updateItem(idx, { discountPct: val });
                            else updateItem(idx, { discountAmount: val });
                          }}
                          className="soleria-input"
                          style={{ fontSize: '13px', width: 70 }}
                          disabled={!item.discountType}
                        />
                      </div>
                    </div>

                    <div className="pt-1 text-right font-lora font-semibold" style={{ fontSize: '14px', color: 'var(--brand-gold)' }}>
                      {formatCurrency(calcItemTotal(item))}
                    </div>

                    <button
                      onClick={() => removeItem(idx)}
                      className="flex items-center justify-center rounded-md transition-colors"
                      style={{ width: 28, height: 28, color: 'var(--error)', border: '1px solid var(--border-color)', background: 'var(--card-surface)' }}
                      disabled={editItems.length <= 1}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="px-5 pb-3" style={{ marginTop: -4 }}>
                    <div className="flex flex-col gap-3">
                      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <SearchableSelect
                          value={item.size}
                          onChange={v => updateItem(idx, { size: v })}
                          options={sizeOptions}
                          placeholder="Select size..."
                          disabled={!item.name}
                          style={{ fontSize: '12px' }}
                        />
                        <SearchableSelect
                          value={item.color}
                          onChange={v => updateItem(idx, { color: v })}
                          options={colorOptions}
                          placeholder="Select color..."
                          disabled={!item.name}
                          style={{ fontSize: '12px' }}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={item.desc}
                        onChange={e => updateItem(idx, { desc: e.target.value })}
                        className="soleria-input"
                        style={{ fontSize: '12px', width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="px-5 py-3">
              <button onClick={addItem} className="btn-dashed flex items-center gap-2">
                <Plus size={14} />
                Add Article
              </button>
            </div>

            <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '2px solid var(--border-section)' }}>
              <span className="font-lora font-semibold" style={{ fontSize: '20px', color: 'var(--brand-gold)' }}>
                {formatCurrency(editGrandTotal)}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={cancelEdit} className="btn-outline" disabled={saving}>Cancel</button>
                <button onClick={handleSave} className="btn-gold" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card-white invoice-print" style={{ padding: 40 }}>
            {/* Header */}
            <div className="flex justify-between items-start" style={{ borderBottom: '2px solid var(--border-section)', paddingBottom: 16 }}>
              <div>
                <h2 className="font-lora font-semibold" style={{ fontSize: '24px', color: 'var(--dark-heading)' }}>
                  STARMANS
                </h2>
                <p
                  className="font-inter uppercase tracking-wider mt-0.5"
                  style={{ fontSize: '11px', color: 'var(--brand-gold)', letterSpacing: '1.5px' }}
                >
                  Sole House
                </p>
                <p className="font-inter mt-2" style={{ fontSize: '12px', color: 'var(--secondary-text)', lineHeight: 1.6 }}>
                  Main Bazaar, Sialkot Road<br />
                  Gujranwala, Pakistan
                </p>
              </div>
              <div className="text-right">
                <div className="font-inter" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
                  <span className="font-semibold" style={{ color: 'var(--dark-heading)' }}>Slip No:</span> {slip.no}
                </div>
                <div className="font-inter mt-1" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
                  <span className="font-semibold" style={{ color: 'var(--dark-heading)' }}>Date:</span> {new Date(`${slip.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <div className="font-inter mt-1" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
                  <span className="font-semibold" style={{ color: 'var(--dark-heading)' }}>Time:</span> {slip.time}
                </div>
              </div>
            </div>

            {/* Billed To */}
            <div className="mt-6">
              <span
                className="font-inter uppercase tracking-wider"
                style={{ fontSize: '11px', color: 'var(--secondary-text)', letterSpacing: '0.6px' }}
              >
                Billed To
              </span>
              <p className="font-inter font-semibold mt-1" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>
                {client.name}
              </p>
              <p className="font-inter" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>
                {client.phone}
              </p>
            </div>

            {/* Items Table */}
            <div className="mt-6">
              <div
                className="grid gap-4 py-3 soleria-table-header"
                style={{ gridTemplateColumns: '1fr 60px 100px 110px', borderBottom: '1px solid var(--border-table)' }}
              >
                <span>Article</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Amount</span>
              </div>

              {slip.items.map((item, idx) => (
                <div key={idx}>
                  <div
                    className="grid gap-4 py-3 items-start"
                    style={{ gridTemplateColumns: '1fr 60px 100px 110px' }}
                  >
                    <div>
                      <span className="font-inter font-medium" style={{ fontSize: '14px', color: 'var(--primary-text)' }}>
                        {item.name}
                      </span>
                      {(item.size || item.color) && (
                        <p className="font-inter" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
                          {item.size} {item.color && `/ ${item.color}`}
                        </p>
                      )}
                      {item.desc && (
                        <p className="font-inter italic" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
                          {item.desc}
                        </p>
                      )}
                    </div>
                    <span className="text-center font-inter" style={{ fontSize: '14px', color: 'var(--primary-text)' }}>
                      {item.qty}
                    </span>
                    <span className="text-right font-inter" style={{ fontSize: '14px', color: 'var(--primary-text)' }}>
                      {formatCurrency(item.price)}
                    </span>
                    <span className="text-right font-inter font-medium" style={{ fontSize: '14px', color: 'var(--primary-text)' }}>
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                  {(item.discountType && (item.discountAmount > 0 || item.discountPct > 0)) && (
                    <div className="flex justify-end pb-2">
                      <span style={{ fontSize: '12px', color: 'var(--error)' }}>
                        Discount ({item.discountType === '%'
                          ? `${item.discountPct}%`
                          : `${formatCurrency(item.discountAmount)} / ${item.subtotal > 0 ? ((item.discountAmount / item.subtotal) * 100).toFixed(1).replace(/\.0$/, '') : '0'}%`})
                        : -{formatCurrency(item.subtotal - item.amount)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Grand Total */}
            <div className="mt-6 pt-4 text-right" style={{ borderTop: '2px solid var(--border-section)' }}>
              <span
                className="font-inter uppercase tracking-wider"
                style={{ fontSize: '11px', color: 'var(--secondary-text)', letterSpacing: '0.6px' }}
              >
                Grand Total
              </span>
              <p className="font-lora font-semibold" style={{ fontSize: '30px', color: 'var(--brand-gold)' }}>
                {formatCurrency(slip.total)}
              </p>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 text-center" style={{ borderTop: '1px dashed var(--border-color)' }}>
              <p className="font-inter" style={{ fontSize: '12px', color: 'var(--muted-text)' }}>
                Thank you for your business
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
