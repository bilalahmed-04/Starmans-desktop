import { apiRequest } from '@/lib/api';
import type { Production, ProductionEntry } from '@/types';

export function getProductions(): Promise<Production[]> {
  return apiRequest<Production[]>('/productions');
}

export function createProduction(date: string, entries: ProductionEntry[]): Promise<Production> {
  return apiRequest<Production>('/productions', {
    method: 'POST',
    body: JSON.stringify({ date, entries }),
  });
}
