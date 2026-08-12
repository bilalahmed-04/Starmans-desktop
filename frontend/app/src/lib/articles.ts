import { apiRequest } from '@/lib/api';
import type { Article } from '@/types';

export function getArticles(): Promise<Article[]> {
  return apiRequest<Article[]>('/articles');
}

export function createArticle(article: {
  name: string;
  color: string;
  size: string;
  price?: number;
  stock?: number;
}): Promise<Article> {
  return apiRequest<Article>('/articles', {
    method: 'POST',
    body: JSON.stringify(article),
  });
}

export function deleteArticle(id: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/articles/${id}`, { method: 'DELETE' });
}
