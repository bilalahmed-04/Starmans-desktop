import { callIpc } from '@/lib/api';
import type { Article } from '@/types';

export function getArticles(): Promise<Article[]> {
  return callIpc<Article[]>(window.api.articles.list());
}

export function createArticle(article: {
  name: string;
  color: string;
  size: string;
  price?: number;
  stock?: number;
}): Promise<Article> {
  return callIpc<Article>(window.api.articles.create(article));
}

export function deleteArticle(id: string): Promise<void> {
  return callIpc<void>(window.api.articles.delete(id));
}
