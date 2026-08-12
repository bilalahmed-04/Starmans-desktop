import { apiRequest } from '@/lib/api';
import type { Bill, BillEntry } from '@/types';

export function getBills(): Promise<Bill[]> {
  return apiRequest<Bill[]>('/bills');
}

export function createBill(date: string, entries: BillEntry[]): Promise<Bill> {
  return apiRequest<Bill>('/bills', {
    method: 'POST',
    body: JSON.stringify({ date, entries }),
  });
}
