import { Router } from 'express';
import Slip from '../models/Slip.js';
import Client from '../models/Client.js';
import Article from '../models/Article.js';
import { requireAuth } from '../middleware/auth.js';
import { weekDateRange } from '../utils/dateHelpers.js';

const router = Router();
router.use(requireAuth);

function calcItemAmount(item) {
  const subtotal = item.qty * item.price;
  if (item.discountType === '%') return Math.max(0, subtotal - subtotal * (item.discountPct / 100));
  if (item.discountType === 'Rs') return Math.max(0, subtotal - item.discountAmount);
  return subtotal;
}

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

async function checkAndDeductStock(items) {
  // Group requested quantities by article name
  const qtys = {};
  for (const item of items) qtys[item.name] = (qtys[item.name] || 0) + item.qty;

  for (const [name, requested] of Object.entries(qtys)) {
    const article = await Article.findOne({ name });
    const available = article?.stock ?? 0;
    if (requested > available) {
      return `${name}: requested ${requested} but only ${available} in stock`;
    }
  }
  // All checks passed — deduct
  for (const [name, qty] of Object.entries(qtys)) {
    await Article.findOneAndUpdate({ name }, { $inc: { stock: -qty } });
  }
  return null;
}

async function restoreStock(items) {
  const qtys = {};
  for (const item of items) qtys[item.name] = (qtys[item.name] || 0) + item.qty;
  for (const [name, qty] of Object.entries(qtys)) {
    await Article.findOneAndUpdate({ name }, { $inc: { stock: qty } });
  }
}

// GET /slips
router.get('/', async (req, res) => {
  try {
    const query = {};
    const { clientId, month, week } = req.query;
    if (clientId) query.clientId = clientId;
    if (month) query.date = { $regex: `^${month}` };
    if (week) {
      const { start, end } = weekDateRange(week);
      query.date = { $gte: start, $lte: end };
    }
    const slips = await Slip.find(query).populate('clientId', 'name phone');
    const result = slips.map(s => {
      const obj = s.toJSON();
      obj.clientName  = s.clientId?.name  || '';
      obj.clientPhone = s.clientId?.phone || '';
      obj.clientId    = s.clientId?._id?.toString() || obj.clientId;
      return obj;
    });
    res.json(result);
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

    // Phone is the identity key: look up by phone first, since the same
    // person may be entered with slightly different name spellings.
    const trimmedName = clientName.trim();
    const trimmedPhone = clientPhone.trim();
    let client = await Client.findOne({
      phone: trimmedPhone,
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
    });
    if (!client) client = await Client.findOne({ phone: trimmedPhone });

    if (client && client.name.trim().toLowerCase() !== trimmedName.toLowerCase()) {
      if (clientResolution === 'existing') {
        // Attach this sale to the existing customer under their stored name.
      } else if (clientResolution === 'new') {
        client = await Client.create({ name: trimmedName, phone: trimmedPhone });
      } else {
        return res.status(409).json({
          error: 'phone_conflict',
          message: `This phone number is already registered to "${client.name}".`,
          existingClient: { id: client._id.toString(), name: client.name, phone: client.phone },
        });
      }
    } else if (!client) {
      client = await Client.create({ name: trimmedName, phone: trimmedPhone });
    }

    const stockError = await checkAndDeductStock(items);
    if (stockError) return res.status(400).json({ error: stockError });

    const now = new Date();
    const enrichedItems = items.map(it => ({
      ...it,
      subtotal: it.qty * it.price,
      amount: calcItemAmount(it),
    }));
    const slip = await Slip.create({
      no: 'SL-' + (Math.floor(Math.random() * 9000) + 1000),
      clientId: client._id,
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      items: enrichedItems,
      total: enrichedItems.reduce((s, it) => s + it.amount, 0),
    });
    const obj = slip.toJSON();
    obj.clientName  = client.name;
    obj.clientPhone = client.phone;
    res.status(201).json(obj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /slips/:id
router.get('/:id', async (req, res) => {
  try {
    const slip = await Slip.findById(req.params.id).populate('clientId', 'name phone');
    if (!slip) return res.status(404).json({ error: 'Slip not found' });
    const obj = slip.toJSON();
    obj.clientName  = slip.clientId?.name  || '';
    obj.clientPhone = slip.clientId?.phone || '';
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /slips/:id
router.put('/:id', async (req, res) => {
  try {
    const slip = await Slip.findById(req.params.id);
    if (!slip) return res.status(404).json({ error: 'Slip not found' });

    const { items } = req.body;
    const itemError = validateItems(items);
    if (itemError) return res.status(400).json({ error: itemError });

    await restoreStock(slip.items);

    const stockError = await checkAndDeductStock(items);
    if (stockError) {
      await restoreStock(slip.items); // re-deduct what we just restored
      // actually checkAndDeductStock deducts only on success, so just re-deduct old items
      await checkAndDeductStock(slip.items);
      return res.status(400).json({ error: stockError });
    }

    const enrichedItems = items.map(it => ({
      ...it,
      subtotal: it.qty * it.price,
      amount: calcItemAmount(it),
    }));
    slip.items = enrichedItems;
    slip.total = enrichedItems.reduce((s, it) => s + it.amount, 0);
    await slip.save();

    const populated = await Slip.findById(slip._id).populate('clientId', 'name phone');
    const obj = populated.toJSON();
    obj.clientName  = populated.clientId?.name  || '';
    obj.clientPhone = populated.clientId?.phone || '';
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /slips/:id
router.delete('/:id', async (req, res) => {
  try {
    const slip = await Slip.findById(req.params.id);
    if (!slip) return res.status(404).json({ error: 'Slip not found' });
    await restoreStock(slip.items);
    await slip.deleteOne();
    res.json({ message: 'Slip deleted and stock restored' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
