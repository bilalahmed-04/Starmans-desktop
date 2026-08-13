import { findPayments, createPayment } from '../models/Payment.js';
import { findClientByNameCaseInsensitive } from '../models/Client.js';
import { ValidationError, NotFoundError } from './errors.js';
import { currentWeekRange, currentMonthRange } from '../utils/dateHelpers.js';

const VALID_METHODS = ['Cash', 'Cheque', 'Online', 'Slip'];

export async function listPayments({ period, month, search } = {}) {
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
  if (search) filter.search = search;
  return findPayments(filter);
}

export async function addPayment({ clientName, clientPhone, method, amount, desc, chequeDate }) {
  if (!clientName?.trim() || !clientPhone?.trim()) throw new ValidationError('Client name and phone are required');
  if (!VALID_METHODS.includes(method)) throw new ValidationError(`Method must be one of: ${VALID_METHODS.join(', ')}`);
  if (!amount || Number(amount) <= 0) throw new ValidationError('Amount must be positive');
  if (method === 'Cheque' && !chequeDate) throw new ValidationError('chequeDate is required for Cheque payments');

  const client = await findClientByNameCaseInsensitive(clientName.trim());
  if (!client) throw new NotFoundError('Client not found. Name must match an existing client.');
  if (client.phone !== clientPhone) throw new ValidationError('Phone number does not match client record');

  const now = new Date();
  const date = now.toISOString().split('T')[0];
  return createPayment({
    clientId: Number(client.id),
    clientName: client.name,
    clientPhone: client.phone,
    date,
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    method,
    amount: Number(amount),
    desc: desc?.trim() || '',
    ...(method === 'Cheque' && { collectionDate: date, chequeDate }),
  });
}
