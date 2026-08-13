import { callIpc } from '@/lib/api';
import type { Production, ProductionEntry } from '@/types';

export function getProductions(): Promise<Production[]> {
  return callIpc<Production[]>(window.api.productions.list());
}

export function createProduction(date: string, entries: ProductionEntry[]): Promise<Production> {
  return callIpc<Production>(window.api.productions.create({ date, entries }));
}
