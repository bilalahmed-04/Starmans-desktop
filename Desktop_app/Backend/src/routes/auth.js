import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { getSettings, upsertSettings } from '../models/Settings.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Throttle brute-force login attempts per IP. Successful logins don't
// count against the limit — only repeated failures do.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// POST /auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const settings = await getSettings();
    if (!settings || username !== settings.username) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, settings.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ username }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    res.json({ token, username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /auth/settings — change username and/or password
router.patch('/settings', requireAuth, async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    if (!username?.trim()) return res.status(400).json({ error: 'Username is required' });

    const settings = await getSettings();
    let passwordHash = settings?.passwordHash;
    if (newPassword) {
      const match = settings && await bcrypt.compare(oldPassword || '', settings.passwordHash);
      if (!match) return res.status(400).json({ error: 'Old password is incorrect' });
      passwordHash = await bcrypt.hash(newPassword, 10);
    }
    if (!passwordHash) return res.status(400).json({ error: 'No existing settings to update' });

    const updated = await upsertSettings({ username: username.trim(), passwordHash });
    const token = jwt.sign({ username: updated.username }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    res.json({ message: 'Settings updated successfully', token, username: updated.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
