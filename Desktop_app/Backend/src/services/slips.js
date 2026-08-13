import {
  findSlips, findSlipById, createSlip, updateSlipItems, deleteSlip,
  InsufficientStockError, PhoneConflictError,
} from '../models/Slip.js';
import { ValidationError, NotFoundError } from './errors.js';
import { weekDateRange } from '../utils/dateHelpers.js';

export { InsufficientStockError, PhoneConflictError };

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) return 'At least one item is required';
  for (const it of items) {
    if (!it.name) return 'Each item must have an article name';
    if (!Number.isInteger(it.qty) || it.qty <= 0) return 'Qty must be a positive integer';
    if (!Number.isInteger(it.price) || it.price <= 0) return 'Price must be a positive integer';
    if (!it.size?.trim()) return 'Size is required for each item';
    if (!it.color?.trim()) return 'Color is required for each item';
    if (!/^\d+(?:-\d+)*$/.test(it.size)) return 'Size must be digits with optional hyphens (e.g. 42-44)';
    const discount = it.discountType === '%' ? it.discountPct : it.discountAmount;
    if (it.discountType && (!Number.isInteger(discount) || discount < 0)) return 'Discount must be a non-negative integer';
    if (it.discountType === '%' && discount > 100) return 'Percentage discount cannot exceed 100';
  }
  return null;
}

export async function listSlips({ clientId, month, week } = {}) {
  const filter = {};
  if (clientId) filter.clientId = clientId;
  if (month) filter.month = month;
  if (week) {
    const { start, end } = weekDateRange(week);
    filter.start = start;
    filter.end = end;
  }
  return findSlips(filter);
}

export async function addSlip({ clientName, clientPhone, clientResolution, items }) {
  if (!clientName?.trim() || !clientPhone?.trim()) throw new ValidationError('Client name and phone are required');
  const itemError = validateItems(items);
  if (itemError) throw new ValidationError(itemError);
  return createSlip({ clientName, clientPhone, clientResolution, items });
}

export async function getSlip(id) {
  if (!Number.isInteger(id)) throw new NotFoundError('Slip not found');
  const slip = await findSlipById(id);
  if (!slip) throw new NotFoundError('Slip not found');
  return slip;
}

export async function editSlip(id, items) {
  if (!Number.isInteger(id)) throw new NotFoundError('Slip not found');
  const itemError = validateItems(items);
  if (itemError) throw new ValidationError(itemError);
  const slip = await updateSlipItems(id, items);
  if (!slip) throw new NotFoundError('Slip not found');
  return slip;
}

export async function removeSlip(id) {
  if (!Number.isInteger(id)) throw new NotFoundError('Slip not found');
  const deleted = await deleteSlip(id);
  if (!deleted) throw new NotFoundError('Slip not found');
}
