import { apiRequest } from '@/lib/api';
import type { ChemPurchase, ChemUsage } from '@/types';

export function getChemPurchases(): Promise<ChemPurchase[]> {
  return apiRequest<ChemPurchase[]>('/chemicals/purchases');
}

export function createChemPurchase(date: string, qty: number, cost: number): Promise<ChemPurchase> {
  return apiRequest<ChemPurchase>('/chemicals/purchases', {
    method: 'POST',
    body: JSON.stringify({ date, qty, cost }),
  });
}

export function getChemUsage(): Promise<ChemUsage[]> {
  return apiRequest<ChemUsage[]>('/chemicals/usage');
}

export function createChemUsage(entries: { date: string; qty: number }[]): Promise<ChemUsage[]> {
  return apiRequest<ChemUsage[]>('/chemicals/usage', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}
