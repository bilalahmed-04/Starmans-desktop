import { Router } from 'express';
import Bill from '../models/Bill.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /bills
router.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.month) query.date = { $regex: `^${req.query.month}` };
    const bills = await Bill.find(query);
    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /bills
router.post('/', async (req, res) => {
  try {
    const { date, entries } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'At least one entry is required' });
    }
    const valid = entries.filter(e => e.name?.trim() && Number(e.amount) > 0);
    if (valid.length === 0) {
      return res.status(400).json({ error: 'No valid entries (each needs a name and a positive amount)' });
    }
    const month = new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const bill = await Bill.create({
      date,
      month,
      entries: valid.map(e => ({ name: e.name.trim(), amount: Number(e.amount) })),
    });
    res.status(201).json(bill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
