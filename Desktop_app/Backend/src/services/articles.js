import { findArticles, createArticle, deleteArticleCascade } from '../models/Article.js';
import { ValidationError, NotFoundError } from './errors.js';

export class DuplicateArticleError extends Error {
  constructor(message) {
    super(message);
    this.code = 'duplicate_article';
  }
}

export async function listArticles({ color, maxStock } = {}) {
  const filter = {};
  if (color) filter.color = color;
  if (maxStock !== undefined && maxStock !== '') {
    const max = Number(maxStock);
    if (!Number.isNaN(max)) filter.maxStock = max;
  }
  return findArticles(filter);
}

export async function addArticle({ name, color, size, price = 0, stock = 0 }) {
  if (!name?.trim()) throw new ValidationError('Article name is required');
  if (size && !/^\d+(?:-\d+)*$/.test(size) && size !== 'Unisex') {
    throw new ValidationError('Size must be digits with optional hyphens (e.g. 42-44) or "Unisex"');
  }
  try {
    return await createArticle({
      name: name.trim(),
      color: color?.trim() || '',
      size: size?.trim() || '',
      price: Number(price),
      stock: Number(stock),
    });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      throw new DuplicateArticleError('An article with this name already exists');
    }
    throw err;
  }
}

export async function removeArticle(id) {
  if (!Number.isInteger(id)) throw new NotFoundError('Article not found');
  const deleted = await deleteArticleCascade(id);
  if (!deleted) throw new NotFoundError('Article not found');
}
