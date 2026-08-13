import { callIpc } from '@/lib/api';
import type { Bill, BillEntry } from '@/types';

export function getBills(): Promise<Bill[]> {
  return callIpc<Bill[]>(window.api.bills.list());
}

export function createBill(date: string, entries: BillEntry[]): Promise<Bill> {
  return callIpc<Bill>(window.api.bills.create({ date, entries }));
}
