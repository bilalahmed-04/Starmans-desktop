import { Router } from 'express';
import Production from '../models/Production.js';
import Article from '../models/Article.js';
import { requireAuth } from '../middleware/auth.js';
import { weekDateRange } from '../utils/dateHelpers.js';

const router = Router();
router.use(requireAuth);

// GET /productions
router.get('/', async (req, res) => {
  try {
    const query = {};
    const { month, week } = req.query;
    if (month) query.date = { $regex: `^${month}` };
    if (week) {
      const { start, end } = weekDateRange(week);
      query.date = { $gte: start, $lte: end };
    }
    const productions = await Production.find(query);
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

    for (const entry of validEntries) {
      const article = await Article.findById(entry.articleId);
      if (!article) return res.status(400).json({ error: `Article ${entry.articleId} not found` });
      entry.articleName = article.name;
      await Article.findByIdAndUpdate(entry.articleId, { $inc: { stock: entry.qty } });
    }

    const production = await Production.create({ date, entries: validEntries });
    res.status(201).json(production);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
