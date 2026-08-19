export interface Article {
  id: string;
  name: string;
  price: number;
  stock: number;
  color: string;
  size: string;
}

export interface SlipItem {
  name: string;
  qty: number;
  price: number;
  subtotal: number;
  discountType: '%' | 'Rs' | null;
  discountAmount: number;
  discountPct: number;
  amount: number;
  desc: string;
  size: string;
  color: string;
}

export interface Slip {
  id: string;
  no: string;
  date: string;
  time: string;
  items: SlipItem[];
  total: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  slips: Slip[];
}

export interface ProductionEntry {
  articleId: string;
  articleName: string;
  qty: number;
}

export interface Production {
  id: string;
  date: string;
  entries: ProductionEntry[];
}

export interface ExpenseRow {
  desc: string;
  price: number;
}

export interface Expense {
  id: string;
  date: string;
  time: string;
  rows: ExpenseRow[];
}

export interface BillEntry {
  name: string;
  amount: number;
}

export interface Bill {
  id: string;
  date: string;
  month: string;
  entries: BillEntry[];
}

export interface ChemPurchase {
  id: string;
  date: string;
  qty: number;
  cost: number;
}

export interface ChemUsage {
  id: string;
  date: string;
  qty: number;
}

export interface Payment {
  id: string;
  date: string;
  time: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  method: 'Cash' | 'Cheque' | 'Online' | 'Slip';
  amount: number;
  desc: string;
  collectionDate?: string;
  chequeDate?: string;
}

export interface AppState {
  page: string;
  articles: Article[];
  clients: Client[];
  productions: Production[];
  expenses: Expense[];
  bills: Bill[];
  chemPurchases: ChemPurchase[];
  chemUsage: ChemUsage[];
  payments: Payment[];
}

export type NavPage =
  | 'login'
  | 'new-sale'
  | 'slips'
  | 'slips-clients'
  | 'slips-weekly'
  | 'slips-monthly'
  | 'client-detail'
  | 'slip-detail'
  | 'stock'
  | 'production'
  | 'production-daily'
  | 'production-weekly'
  | 'production-monthly'
  | 'bills'
  | 'bills-add'
  | 'bills-all'
  | 'chemical'
  | 'chemical-manage'
  | 'chemical-purchases'
  | 'chemical-usage'
  | 'expenses'
  | 'expenses-new'
  | 'expenses-weekly'
  | 'expenses-monthly'
  | 'expenses-alltime'
  | 'profit'
  | 'profit-monthly'
  | 'profit-annual'
  | 'profit-analytics'
  | 'payment'
  | 'payment-new'
  | 'payment-weekly'
  | 'payment-monthly'
  | 'settings'
  | 'backup';
