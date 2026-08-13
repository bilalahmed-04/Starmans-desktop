import { Router } from 'express';
import { findProductions, createProductionWithEntries, ArticleNotFoundError } from '../models/Production.js';
import { requireAuth } from '../middleware/auth.js';
import { weekDateRange } from '../utils/dateHelpers.js';

const router = Router();
router.use(requireAuth);

// GET /productions
router.get('/', async (req, res) => {
  try {
    const { month, week } = req.query;
    const filter = {};
    if (month) filter.month = month;
    if (week) {
      const { start, end } = weekDateRange(week);
      filter.start = start;
      filter.end = end;
    }
    const productions = await findProductions(filter);
    res.json(productions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /productions
router.post('/', async (req, res) => {
  try {
    const { date, entries } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'At least one entry is required' });
    }
    const validEntries = entries.filter(e => Number(e.qty) > 0);
    if (validEntries.length === 0) return res.status(400).json({ error: 'All quantities are zero' });

    const production = await createProductionWithEntries({ date, entries: validEntries });
    res.status(201).json(production);
  } catch (err) {
    if (err instanceof ArticleNotFoundError) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
