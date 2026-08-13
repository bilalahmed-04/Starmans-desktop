import { useState, useMemo, useRef } from 'react';
import { useApp, formatCurrency } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';
import type { SlipItem } from '@/types';
import { X, Plus } from 'lucide-react';
import { createSlip, getClients } from '@/lib/slips';
import { getArticles } from '@/lib/articles';
import { ApiError } from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';

function calcItemTotal(item: SlipItem): number {
  const subtotal = item.qty * item.price;
  let discount = 0;
  if (item.discountType === '%') {
    discount = subtotal * (item.discountPct / 100);
  } else if (item.discountType === 'Rs') {
    discount = item.discountAmount;
  }
  return Math.max(0, Math.round(subtotal - discount));
}

export default function NewSalePage() {
  const { state, dispatch } = useApp();
  const [items, setItems] = useState<SlipItem[]>([
    { name: '', qty: 1, price: 0, subtotal: 0, discountType: '%', discountAmount: 0, discountPct: 0, amount: 0, desc: '', size: '', color: '' }
  ]);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isSubmitting = useRef(false);

  const grandTotal = useMemo(() => items.reduce((sum, it) => sum + calcItemTotal(it), 0), [items]);

  const existingClient = useMemo(() => {
    if (!clientName.trim()) return null;
    return state.clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
  }, [clientName, state.clients]);

  const isClientMatch = Boolean(existingClient);

  // Phone number is the real identity key — a client with the same phone
  // but a different (differently spelled) name needs an explicit choice.
  const phoneMatch = useMemo(() => {
    if (!clientPhone.trim()) return null;
    return state.clients.find(c => c.phone === clientPhone.trim());
  }, [clientPhone, state.clients]);

  const phoneConflict = Boolean(
    phoneMatch && clientName.trim() && phoneMatch.name.trim().toLowerCase() !== clientName.trim().toLowerCase()
  );

  const [clientResolution, setClientResolution] = useState<'existing' | 'new' | null>(null);

  // Reset the resolution choice whenever the underlying conflict changes,
  // using the render-phase adjustment pattern instead of an effect.
  const conflictKey = `${phoneMatch?.id ?? ''}::${clientName.trim().toLowerCase()}`;
  const [lastConflictKey, setLastConflictKey] = useState(conflictKey);
  if (conflictKey !== lastConflictKey) {
    setLastConflictKey(conflictKey);
    setClientResolution(null);
  }

  function updateItem(idx: number, updates: Partial<SlipItem>) {
    setFormError('');
    const newItems = items.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, ...updates };
      updated.subtotal = updated.qty * updated.price;
      updated.amount = calcItemTotal(updated);
      return updated;
    });
    setItems(newItems);
  }

  function addItem() {
    setItems([...items, { name: '', qty: 1, price: 0, subtotal: 0, discountType: '%', discountAmount: 0, discountPct: 0, amount: 0, desc: '', size: '', color: '' }]);
  }

  function removeItem(idx: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  }

  async function handleConfirm() {
    if (isSubmitting.current) return;

    if (!clientName.trim() || !clientPhone.trim()) {
      setFormError('Client name and phone number are required.');
      return;
    }

    if (phoneConflict && !clientResolution) {
      setFormError('This phone number is already registered under a different name. Choose how to proceed.');
      return;
    }

    for (const item of items) {
      const discount = item.discountType === '%' ? item.discountPct : item.discountAmount;
      if (!item.name || !item.size.trim() || !item.color.trim()) {
        setFormError('Article, size, and color are required for every item.');
        return;
      }
      if (!Number.isInteger(item.qty) || item.qty <= 0 || !Number.isInteger(item.price) || item.price <= 0) {
        setFormError('Quantity and price must be positive whole numbers.');
        return;
      }
      if (!/^\d+(?:-\d+)*$/.test(item.size)) {
        setFormError('Size may contain only whole numbers and hyphens (for example, 42-44).');
        return;
      }
      if (!item.discountType || !Number.isInteger(discount) || discount < 0) {
        setFormError('Discount must be a whole number.');
        return;
      }
      if (item.discountType === '%' && discount > 100) {
        setFormError('Percentage discount cannot exceed 100.');
        return;
      }
    }

    const quantitiesByArticle = items.reduce<Record<string, number>>((totals, item) => {
      totals[item.name] = (totals[item.name] || 0) + item.qty;
      return totals;
    }, {});
    for (const [articleName, requestedQty] of Object.entries(quantitiesByArticle)) {
      const available = state.articles.find(article => article.name === articleName)?.stock ?? 0;
      if (requestedQty > available) {
        setFormError(`${articleName} quantity (${requestedQty}) exceeds available stock (${available}).`);
        return;
      }
    }

    isSubmitting.current = true;
    setSubmitting(true);
    const validItems = items;

    try {
      const created = await createSlip({
        clientName,
        clientPhone,
        ...(phoneConflict && clientResolution ? { clientResolution } : {}),
        items: validItems,
      }) as { no: string };

      const [articles, clients] = await Promise.all([getArticles(), getClients()]);
      dispatch({ type: 'SET_ARTICLES', articles });
      dispatch({ type: 'SET_CLIENTS', clients });

      setSuccessMsg(`Sale confirmed! Slip ${created.no} created.`);
      setFormError('');
      setTimeout(() => setSuccessMsg(''), 3000);

      // Reset form
      setItems([{ name: '', qty: 1, price: 0, subtotal: 0, discountType: '%', discountAmount: 0, discountPct: 0, amount: 0, desc: '', size: '', color: '' }]);
      setClientName('');
      setClientPhone('');
      setClientResolution(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.body?.error === 'phone_conflict') {
        setFormError(err.body.message || err.message);
      } else {
        setFormError(err instanceof Error ? err.message : 'Failed to confirm sale. Please try again.');
      }
    } finally {
      isSubmitting.current = false;
      setSubmitting(false);
    }
  }

  const canConfirm = useMemo(() => {
    if (!clientName.trim() || !clientPhone.trim() || items.length === 0) return false;
    if (phoneConflict && !clientResolution) return false;

    const fieldsAreValid = items.every(item => {
      const discount = item.discountType === '%' ? item.discountPct : item.discountAmount;
      return Boolean(
        item.name &&
        item.size.trim() &&
        /^\d+(?:-\d+)*$/.test(item.size) &&
        item.color.trim() &&
        Number.isInteger(item.qty) && item.qty > 0 &&
        Number.isInteger(item.price) && item.price > 0 &&
        item.discountType &&
        Number.isInteger(discount) && discount >= 0 &&
        (item.discountType !== '%' || discount <= 100)
      );
    });
    if (!fieldsAreValid) return false;

    const quantitiesByArticle = items.reduce<Record<string, number>>((totals, item) => {
      totals[item.name] = (totals[item.name] || 0) + item.qty;
      return totals;
    }, {});

    return Object.entries(quantitiesByArticle).every(([articleName, requestedQty]) => {
      const available = state.articles.find(article => article.name === articleName)?.stock ?? 0;
      return requestedQty <= available;
    });
  }, [clientName, clientPhone, items, state.articles, phoneConflict, clientResolution]);

  return (
    <AppLayout pageTitle="New Sale">
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {successMsg && (
          <div className="banner-success rounded-lg px-4 py-3 text-sm mb-4">{successMsg}</div>
        )}
        {formError && (
          <div className="banner-error rounded-lg px-4 py-3 text-sm mb-4">{formError}</div>
        )}

        {/* Sale Items Table */}
        <div className="card-white">
          {/* Header row */}
          <div
            className="grid gap-3 px-5 py-3 soleria-table-header"
            style={{ gridTemplateColumns: '210px 48px 120px 180px 100px 30px', background: 'var(--app-bg)' }}
          >
            <span>Article</span>
<span style={{ justifySelf: "start" }}>Qty</span>
<span style={{ justifySelf: "start" }}>Price</span>
            <span style={{ justifySelf: "center" }}>Discount</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {/* Item rows */}
          {items.map((item, idx) => {
            const article = state.articles.find(a => a.name === item.name);
            const requestedArticleQty = items
              .filter(row => row.name === item.name)
              .reduce((total, row) => total + row.qty, 0);
            const stockExceeded = Boolean(article && requestedArticleQty > article.stock);

            // Only sizes/colors that genuinely exist in stock for this article
            // are selectable — narrowed further by whichever of the two is
            // already picked, so a nonexistent size/color combo can't be sold.
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
                  {/* Article select */}
                  <div>
                    <select
                      value={item.name}
                      onChange={e => updateItem(idx, { name: e.target.value, price: 0, size: '', color: '' })}
                      className="soleria-input cursor-pointer"
                      style={{ fontSize: '13px',width: '100%' }}
                    >
                      <option value="">Select article...</option>
                      {state.articles.map(a => (
                        <option key={a.id} value={a.name}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    {article && (
                      <div className="mt-1 font-inter" style={{ fontSize: '11px', color: 'var(--secondary-text)' }}>
                        In stock: {article.stock} pairs
                      </div>
                    )}
                  </div>

                  {/* Qty */}
                  <div>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.qty || ''}
                      onChange={e => updateItem(idx, { qty: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="soleria-input text-center"
                      style={{
                        width: '100%',
                        fontSize: '13px',
                        borderColor: stockExceeded ? 'var(--error)' : undefined,
                      }}
                    />
                    {stockExceeded && (
                      <div className="mt-1 whitespace-nowrap" style={{ fontSize: '10px', color: 'var(--error)' }}>
                        Only {article?.stock} in stock
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={item.price || ''}
                    onChange={e => updateItem(idx, { price: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="soleria-input text-right"
                    style={{ fontSize: '13px' }}
                  />

                  {/* Discount */}
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
                    {item.discountType && (item.discountPct > 0 || item.discountAmount > 0) && (
                      <div className="mt-1" style={{ fontSize: '11px', color: 'var(--success)' }}>
                        saves {formatCurrency(item.subtotal - calcItemTotal(item))}
                      </div>
                    )}
                  </div>

                  {/* Total */}
                  <div className="pt-1 text-right font-lora font-semibold" style={{ fontSize: '14px', color: 'var(--brand-gold)' }}>
                    {formatCurrency(calcItemTotal(item))}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(idx)}
                    className="flex items-center justify-center rounded-md transition-colors"
                    style={{
                      width: 28,
                      height: 28,
                      color: 'var(--error)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--card-surface)',
                    }}
                    disabled={items.length <= 1}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Sub-fields */}
                <div className="px-5 pb-3" style={{ marginTop: -4 }}>
 <div className="flex flex-col gap-3">
  {/* Size & Color */}
  <div
    className="grid gap-3"
    style={{ gridTemplateColumns: '1fr 1fr' }}
  >
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

  {/* Description */}
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

          {/* Add article button */}
          <div className="px-5 py-3">
            <button onClick={addItem} className="btn-dashed flex items-center gap-2">
              <Plus size={14} />
              Add Article
            </button>
          </div>
        </div>

        {/* Bottom row */}
        <div className="flex gap-4 mt-4" style={{ flexWrap: 'wrap' }}>
          {/* Client Card */}
          <div className="card-white flex-1" style={{ padding: 18, minWidth: 280 }}>
            <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label className="block font-inter font-semibold mb-1" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>
                  Client Name
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => { setClientName(e.target.value); setFormError(''); }}
                  placeholder="Enter client name..."
                  className="soleria-input"
                />
                {isClientMatch && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
                    <span style={{ fontSize: '11px', color: 'var(--success)' }}>Existing client</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block font-inter font-semibold mb-1" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={clientPhone}
                  onChange={e => {
                    if (/^\d*$/.test(e.target.value)) {
                      setClientPhone(e.target.value);
                      setFormError('');
                    }
                  }}
                  placeholder="Enter phone..."
                  className="soleria-input"
                />
              </div>
            </div>

            {phoneConflict && phoneMatch && (
              <div className="mt-3 rounded-lg p-3" style={{ background: '#FDFBF7', border: '1px solid #E3D9C6' }}>
                <p className="font-inter" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>
                  This phone number is already registered to <strong>{phoneMatch.name}</strong>. Is this the same customer?
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setClientResolution('existing')}
                    className={clientResolution === 'existing' ? 'choice-pill-active' : 'choice-pill-inactive'}
                  >
                    Use "{phoneMatch.name}"
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientResolution('new')}
                    className={clientResolution === 'new' ? 'choice-pill-active' : 'choice-pill-inactive'}
                  >
                    New customer "{clientName.trim()}"
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Total Box */}
          <div
            className="flex flex-col justify-center"
            style={{
              width: 280,
              background: 'var(--brand-navy)',
              borderRadius: 12,
              padding: '24px 26px',
            }}
          >
            <span
              className="font-inter uppercase"
              style={{ fontSize: '11px', color: 'rgba(250,248,243,0.55)', letterSpacing: '1.4px' }}
            >
              Total
            </span>
            <span
              className="font-lora font-semibold"
              style={{ fontSize: '30px', color: 'var(--brand-gold)' }}
            >
              Rs {grandTotal.toLocaleString('en-US')}
            </span>
          </div>
        </div>

        {/* Confirm button */}
        <div className="mt-4 flex justify-end" data-no-print>
          <button
            onClick={handleConfirm}
            className="btn-gold"
            disabled={!canConfirm || submitting}
          >
            {submitting ? 'Confirming...' : 'Confirm Sale'}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
