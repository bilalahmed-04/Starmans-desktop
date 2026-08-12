import { Router } from 'express';
import Client from '../models/Client.js';
import Slip from '../models/Slip.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /clients — list all clients, slips embedded
router.get('/', async (req, res) => {
  try {
    const clients = await Client.find();
    const slips = await Slip.find();
    const result = clients.map(c => {
      const clientObj = c.toJSON();
      clientObj.slips = slips
        .filter(s => s.clientId.toString() === c._id.toString())
        .map(s => s.toJSON());
      return clientObj;
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /clients/:id
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const slips = await Slip.find({ clientId: client._id });
    res.json({ ...client.toJSON(), slips: slips.map(s => s.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /clients
router.post('/', async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }
    const existing = await Client.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (existing) return res.status(409).json({ error: 'Client already exists', client: existing });
    const client = await Client.create({ name: name.trim(), phone: phone.trim() });
    res.status(201).json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
