import { findChemPurchases, createChemPurchase } from '../models/ChemPurchase.js';
import { findChemUsages, getChemSummary, createChemUsagesWithStockCheck, InsufficientStockError } from '../models/ChemUsage.js';
import { ValidationError } from './errors.js';

export { InsufficientStockError };

export async function getSummary() {
  return getChemSummary();
}

export async function listPurchases({ month } = {}) {
  return findChemPurchases({ month });
}

export async function addPurchase({ date, qty, cost }) {
  if (!date) throw new ValidationError('Date is required');
  if (!qty || Number(qty) <= 0) throw new ValidationError('Quantity must be positive');
  if (!cost || Number(cost) <= 0) throw new ValidationError('Cost must be positive');
  return createChemPurchase({ date, qty: Number(qty), cost: Number(cost) });
}

export async function listUsages({ month } = {}) {
  return findChemUsages({ month });
}

// Accepts { date, qty } or { entries: [...] }
export async function addUsage(body) {
  const raw = body.entries ? body.entries : [body];
  const valid = raw.filter(e => e.date && Number(e.qty) > 0);
  if (valid.length === 0) throw new ValidationError('At least one valid usage entry is required');
  return createChemUsagesWithStockCheck(valid);
}
