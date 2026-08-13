import { findProductions, createProductionWithEntries, ArticleNotFoundError } from '../models/Production.js';
import { ValidationError } from './errors.js';
import { weekDateRange } from '../utils/dateHelpers.js';

export { ArticleNotFoundError };

export async function listProductions({ month, week } = {}) {
  const filter = {};
  if (month) filter.month = month;
  if (week) {
    const { start, end } = weekDateRange(week);
    filter.start = start;
    filter.end = end;
  }
  return findProductions(filter);
}

export async function addProduction({ date, entries }) {
  if (!date) throw new ValidationError('Date is required');
  if (!Array.isArray(entries) || entries.length === 0) throw new ValidationError('At least one entry is required');
  const validEntries = entries.filter(e => Number(e.qty) > 0);
  if (validEntries.length === 0) throw new ValidationError('All quantities are zero');
  return createProductionWithEntries({ date, entries: validEntries });
}
