import { Router } from 'express';
import ChemPurchase from '../models/ChemPurchase.js';
import ChemUsage from '../models/ChemUsage.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /chemicals/summary
router.get('/summary', async (req, res) => {
  try {
    const purchases = await ChemPurchase.find();
    const usages = await ChemUsage.find();
    const totalPurchased = purchases.reduce((s, p) => s + p.qty, 0);
    const totalUsed = usages.reduce((s, u) => s + u.qty, 0);
    res.json({ totalPurchased, totalUsed, remaining: totalPurchased - totalUsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chemicals/purchases
router.get('/purchases', async (req, res) => {
  try {
    const query = {};
    if (req.query.month) query.date = { $regex: `^${req.query.month}` };
    const purchases = await ChemPurchase.find(query);
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
    const purchase = await ChemPurchase.create({ date, qty: Number(qty), cost: Number(cost) });
    res.status(201).json(purchase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chemicals/usage
router.get('/usage', async (req, res) => {
  try {
    const query = {};
    if (req.query.month) query.date = { $regex: `^${req.query.month}` };
    const usages = await ChemUsage.find(query);
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

    const requestedQty = valid.reduce((s, e) => s + Number(e.qty), 0);
    const [purchases, usages] = await Promise.all([ChemPurchase.find(), ChemUsage.find()]);
    const totalPurchased = purchases.reduce((s, p) => s + p.qty, 0);
    const totalUsed = usages.reduce((s, u) => s + u.qty, 0);
    const remaining = totalPurchased - totalUsed;
    if (requestedQty > remaining) {
      return res.status(400).json({ error: `Usage exceeds remaining stock. Only ${remaining} kg available.` });
    }

    const created = await ChemUsage.insertMany(
      valid.map(e => ({ date: e.date, qty: Number(e.qty) }))
    );
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
