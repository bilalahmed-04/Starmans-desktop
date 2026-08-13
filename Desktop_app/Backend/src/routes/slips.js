import { Router } from 'express';
import {
  findSlips, findSlipById, createSlip, updateSlipItems, deleteSlip,
  InsufficientStockError, PhoneConflictError,
} from '../models/Slip.js';
import { requireAuth } from '../middleware/auth.js';
import { weekDateRange } from '../utils/dateHelpers.js';

const router = Router();
router.use(requireAuth);

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) return 'At least one item is required';
  for (const it of items) {
    if (!it.name) return 'Each item must have an article name';
    if (!Number.isInteger(it.qty) || it.qty <= 0) return 'Qty must be a positive integer';
    if (!Number.isInteger(it.price) || it.price <= 0) return 'Price must be a positive integer';
    if (!it.size?.trim()) return 'Size is required for each item';
    if (!it.color?.trim()) return 'Color is required for each item';
    if (!/^\d+(?:-\d+)*$/.test(it.size)) return 'Size must be digits with optional hyphens (e.g. 42-44)';
    const discount = it.discountType === '%' ? it.discountPct : it.discountAmount;
    if (it.discountType && (!Number.isInteger(discount) || discount < 0)) return 'Discount must be a non-negative integer';
    if (it.discountType === '%' && discount > 100) return 'Percentage discount cannot exceed 100';
  }
  return null;
}

// GET /slips
router.get('/', async (req, res) => {
  try {
    const { clientId, month, week } = req.query;
    const filter = {};
    if (clientId) filter.clientId = clientId;
    if (month) filter.month = month;
    if (week) {
      const { start, end } = weekDateRange(week);
      filter.start = start;
      filter.end = end;
    }
    const slips = await findSlips(filter);
    res.json(slips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /slips
router.post('/', async (req, res) => {
  try {
    const { clientName, clientPhone, clientResolution, items } = req.body;
    if (!clientName?.trim() || !clientPhone?.trim()) {
      return res.status(400).json({ error: 'Client name and phone are required' });
    }
    const itemError = validateItems(items);
    if (itemError) return res.status(400).json({ error: itemError });

    const slip = await createSlip({ clientName, clientPhone, clientResolution, items });
    res.status(201).json(slip);
  } catch (err) {
    if (err instanceof PhoneConflictError) {
      return res.status(409).json({
        error: 'phone_conflict',
        message: `This phone number is already registered to "${err.existingClient.name}".`,
        existingClient: err.existingClient,
      });
    }
    if (err instanceof InsufficientStockError) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /slips/:id
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Slip not found' });
    const slip = await findSlipById(id);
    if (!slip) return res.status(404).json({ error: 'Slip not found' });
    res.json(slip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /slips/:id
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Slip not found' });

    const { items } = req.body;
    const itemError = validateItems(items);
    if (itemError) return res.status(400).json({ error: itemError });

    const slip = await updateSlipItems(id, items);
    if (!slip) return res.status(404).json({ error: 'Slip not found' });
    res.json(slip);
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /slips/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Slip not found' });
    const deleted = await deleteSlip(id);
    if (!deleted) return res.status(404).json({ error: 'Slip not found' });
    res.json({ message: 'Slip deleted and stock restored' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
