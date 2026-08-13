import { Router } from 'express';
import { findExpenses, createExpenseWithRows } from '../models/Expense.js';
import { requireAuth } from '../middleware/auth.js';
import { currentWeekRange, currentMonthRange } from '../utils/dateHelpers.js';

const router = Router();
router.use(requireAuth);

// GET /expenses
router.get('/', async (req, res) => {
  try {
    const { period, month } = req.query;
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
    const expenses = await findExpenses(filter);
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /expenses
router.post('/', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'At least one row is required' });
    }
    const valid = rows.filter(r => r.desc?.trim() && Number(r.price) > 0);
    if (valid.length === 0) {
      return res.status(400).json({ error: 'No valid rows (each needs a description and a positive price)' });
    }
    const now = new Date();
    const expense = await createExpenseWithRows({
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      rows: valid.map(r => ({ desc: r.desc.trim(), price: Number(r.price) })),
    });
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
