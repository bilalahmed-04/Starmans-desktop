import { Router } from 'express';
import Payment from '../models/Payment.js';
import Client from '../models/Client.js';
import { requireAuth } from '../middleware/auth.js';
import { currentWeekRange, currentMonthRange } from '../utils/dateHelpers.js';

const router = Router();
router.use(requireAuth);

const VALID_METHODS = ['Cash', 'Cheque', 'Online', 'Slip'];

// GET /payments
router.get('/', async (req, res) => {
  try {
    const query = {};
    const { period, month, search } = req.query;

    if (month) {
      query.date = { $regex: `^${month}` };
    } else if (period === 'weekly') {
      const { start, end } = currentWeekRange();
      query.date = {
        $gte: start.toISOString().split('T')[0],
        $lte: end.toISOString().split('T')[0],
      };
    } else if (period === 'monthly') {
      query.date = { $regex: `^${currentMonthRange()}` };
    }

    if (search) {
      const q = search;
      query.$or = [
        { clientName: { $regex: q, $options: 'i' } },
        { clientPhone: { $regex: q } },
        { method: { $regex: q, $options: 'i' } },
      ];
    }

    const payments = await Payment.find(query);
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

    const client = await Client.findOne({ name: { $regex: new RegExp(`^${clientName.trim()}$`, 'i') } });
    if (!client) return res.status(404).json({ error: 'Client not found. Name must match an existing client.' });
    if (client.phone !== clientPhone) {
      return res.status(400).json({ error: 'Phone number does not match client record' });
    }

    const now = new Date();
    const payment = await Payment.create({
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      clientId: client._id,
      clientName: client.name,
      clientPhone: client.phone,
      method,
      amount: Number(amount),
      desc: desc?.trim() || '',
      ...(method === 'Cheque' && {
        collectionDate: now.toISOString().split('T')[0],
        chequeDate,
      }),
    });
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
