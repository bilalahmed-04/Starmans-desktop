import { Router } from 'express';
import { findChemPurchases, createChemPurchase } from '../models/ChemPurchase.js';
import { findChemUsages, getChemSummary, createChemUsagesWithStockCheck, InsufficientStockError } from '../models/ChemUsage.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /chemicals/summary
router.get('/summary', async (req, res) => {
  try {
    res.json(await getChemSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chemicals/purchases
router.get('/purchases', async (req, res) => {
  try {
    const purchases = await findChemPurchases({ month: req.query.month });
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chemicals/purchases
router.post('/purchases', async (req, res) => {
  try {
    const { date, qty, cost } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    if (!qty || Number(qty) <= 0) return res.status(400).json({ error: 'Quantity must be positive' });
    if (!cost || Number(cost) <= 0) return res.status(400).json({ error: 'Cost must be positive' });
    const purchase = await createChemPurchase({ date, qty: Number(qty), cost: Number(cost) });
    res.status(201).json(purchase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chemicals/usage
router.get('/usage', async (req, res) => {
  try {
    const usages = await findChemUsages({ month: req.query.month });
    res.json(usages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chemicals/usage — accepts { date, qty } or { entries: [...] }
router.post('/usage', async (req, res) => {
  try {
    const raw = req.body.entries ? req.body.entries : [req.body];
    const valid = raw.filter(e => e.date && Number(e.qty) > 0);
    if (valid.length === 0) {
      return res.status(400).json({ error: 'At least one valid usage entry is required' });
    }

    const created = await createChemUsagesWithStockCheck(valid);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
