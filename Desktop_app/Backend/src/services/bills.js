import { findBills, createBillWithEntries } from '../models/Bill.js';
import { ValidationError } from './errors.js';

export async function listBills({ month } = {}) {
  return findBills({ month });
}

export async function addBill({ date, entries }) {
  if (!date) throw new ValidationError('Date is required');
  if (!Array.isArray(entries) || entries.length === 0) throw new ValidationError('At least one entry is required');
  const valid = entries.filter(e => e.name?.trim() && Number(e.amount) > 0);
  if (valid.length === 0) throw new ValidationError('No valid entries (each needs a name and a positive amount)');
  const month = new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return createBillWithEntries({
    date,
    month,
    entries: valid.map(e => ({ name: e.name.trim(), amount: Number(e.amount) })),
  });
}
