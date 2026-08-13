import { findExpenses, createExpenseWithRows } from '../models/Expense.js';
import { ValidationError } from './errors.js';
import { currentWeekRange, currentMonthRange } from '../utils/dateHelpers.js';

export async function listExpenses({ period, month } = {}) {
  const filter = {};
  if (month) {
    filter.month = month;
  } else if (period === 'weekly') {
    const { start, end } = currentWeekRange();
    filter.start = start.toISOString().split('T')[0];
    filter.end = end.toISOString().split('T')[0];
  } else if (period === 'monthly') {
    filter.month = currentMonthRange();
  }
  return findExpenses(filter);
}

export async function addExpense({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('At least one row is required');
  const valid = rows.filter(r => r.desc?.trim() && Number(r.price) > 0);
  if (valid.length === 0) throw new ValidationError('No valid rows (each needs a description and a positive price)');
  const now = new Date();
  return createExpenseWithRows({
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    rows: valid.map(r => ({ desc: r.desc.trim(), price: Number(r.price) })),
  });
}
