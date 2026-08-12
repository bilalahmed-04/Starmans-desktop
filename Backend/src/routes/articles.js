import { Router } from 'express';
import Article from '../models/Article.js';
import Production from '../models/Production.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /articles?color=&maxStock=
router.get('/', async (req, res) => {
  try {
    const { color, maxStock } = req.query;
    const query = {};
    if (color) query.color = color;
    if (maxStock !== undefined && maxStock !== '') {
      const max = Number(maxStock);
      if (!Number.isNaN(max)) query.stock = { $lte: max };
    }
    const articles = await Article.find(query);
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
    const article = await Article.create({ name: name.trim(), color: color?.trim() || '', size: size?.trim() || '', price: Number(price), stock: Number(stock) });
    res.status(201).json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /articles/:id — also cleans up production entries that reference it
router.delete('/:id', async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article not found' });

    // Remove entries referencing this article; drop productions that become empty
    const prods = await Production.find({ 'entries.articleId': req.params.id });
    for (const prod of prods) {
      prod.entries = prod.entries.filter(e => e.articleId !== req.params.id);
      if (prod.entries.length === 0) await prod.deleteOne();
      else await prod.save();
    }
    res.json({ message: 'Article deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
