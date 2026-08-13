import { Router } from 'express';
import { findClients, findClientById, findClientByNameCaseInsensitive, createClient } from '../models/Client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /clients — list all clients, slips embedded
router.get('/', async (req, res) => {
  try {
    const clients = await findClients();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /clients/:id
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Client not found' });
    const client = await findClientById(id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
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
    const existing = await findClientByNameCaseInsensitive(name.trim());
    if (existing) return res.status(409).json({ error: 'Client already exists', client: existing });
    const client = await createClient({ name: name.trim(), phone: phone.trim() });
    res.status(201).json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
