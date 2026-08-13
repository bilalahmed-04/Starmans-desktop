import { callIpc } from '@/lib/api';
import type { ChemPurchase, ChemUsage } from '@/types';

export function getChemPurchases(): Promise<ChemPurchase[]> {
  return callIpc<ChemPurchase[]>(window.api.chemicals.listPurchases());
}

export function createChemPurchase(date: string, qty: number, cost: number): Promise<ChemPurchase> {
  return callIpc<ChemPurchase>(window.api.chemicals.createPurchase({ date, qty, cost }));
}

export function getChemUsage(): Promise<ChemUsage[]> {
  return callIpc<ChemUsage[]>(window.api.chemicals.listUsages());
}

export function createChemUsage(entries: { date: string; qty: number }[]): Promise<ChemUsage[]> {
  return callIpc<ChemUsage[]>(window.api.chemicals.createUsage({ entries }));
}
