import { Router } from 'express';
import { findArticles, createArticle, deleteArticleCascade } from '../models/Article.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /articles?color=&maxStock=
router.get('/', async (req, res) => {
  try {
    const { color, maxStock } = req.query;
    const filter = {};
    if (color) filter.color = color;
    if (maxStock !== undefined && maxStock !== '') {
      const max = Number(maxStock);
      if (!Number.isNaN(max)) filter.maxStock = max;
    }
    const articles = await findArticles(filter);
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /articles
router.post('/', async (req, res) => {
  try {
    const { name, color, size, price = 0, stock = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Article name is required' });
    if (size && !/^\d+(?:-\d+)*$/.test(size) && size !== 'Unisex') {
      return res.status(400).json({ error: 'Size must be digits with optional hyphens (e.g. 42-44) or "Unisex"' });
    }
    const article = await createArticle({
      name: name.trim(),
      color: color?.trim() || '',
      size: size?.trim() || '',
      price: Number(price),
      stock: Number(stock),
    });
    res.status(201).json(article);
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(400).json({ error: 'An article with this name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /articles/:id — also cleans up production entries that reference it
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Article not found' });
    const deleted = await deleteArticleCascade(id);
    if (!deleted) return res.status(404).json({ error: 'Article not found' });
    res.json({ message: 'Article deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
