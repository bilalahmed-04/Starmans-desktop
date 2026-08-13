import { callIpc } from '@/lib/api';
import type { Expense, ExpenseRow } from '@/types';

export function getExpenses(): Promise<Expense[]> {
  return callIpc<Expense[]>(window.api.expenses.list());
}

export function createExpense(rows: ExpenseRow[]): Promise<Expense> {
  return callIpc<Expense>(window.api.expenses.create({ rows }));
}
