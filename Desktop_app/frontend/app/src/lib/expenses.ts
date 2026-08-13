import { apiRequest } from '@/lib/api';
import type { Expense, ExpenseRow } from '@/types';

export function getExpenses(): Promise<Expense[]> {
  return apiRequest<Expense[]>('/expenses');
}

export function createExpense(rows: ExpenseRow[]): Promise<Expense> {
  return apiRequest<Expense>('/expenses', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
}
