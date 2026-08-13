import { Router } from 'express';
import { findPayments, createPayment } from '../models/Payment.js';
import { findClientByNameCaseInsensitive } from '../models/Client.js';
import { requireAuth } from '../middleware/auth.js';
import { currentWeekRange, currentMonthRange } from '../utils/dateHelpers.js';

const router = Router();
router.use(requireAuth);

const VALID_METHODS = ['Cash', 'Cheque', 'Online', 'Slip'];

// GET /payments
router.get('/', async (req, res) => {
  try {
    const { period, month, search } = req.query;
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

    const payments = await findPayments(filter);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /payments
router.post('/', async (req, res) => {
  try {
    const { clientName, clientPhone, method, amount, desc, chequeDate } = req.body;
    if (!clientName?.trim() || !clientPhone?.trim()) {
      return res.status(400).json({ error: 'Client name and phone are required' });
    }
    if (!VALID_METHODS.includes(method)) {
      return res.status(400).json({ error: `Method must be one of: ${VALID_METHODS.join(', ')}` });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }
    if (method === 'Cheque' && !chequeDate) {
      return res.status(400).json({ error: 'chequeDate is required for Cheque payments' });
    }

    const client = await findClientByNameCaseInsensitive(clientName.trim());
    if (!client) return res.status(404).json({ error: 'Client not found. Name must match an existing client.' });
    if (client.phone !== clientPhone) {
      return res.status(400).json({ error: 'Phone number does not match client record' });
    }

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const payment = await createPayment({
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
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
