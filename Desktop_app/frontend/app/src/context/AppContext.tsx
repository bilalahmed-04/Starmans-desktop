import React, { createContext, useContext, useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';
import type {
  Article, Client, Production, Expense, Bill,
  ChemPurchase, ChemUsage, Payment, Slip
} from '@/types';
import { getArticles } from '@/lib/articles';
import { getClients } from '@/lib/slips';
import { getProductions } from '@/lib/productions';
import { getExpenses } from '@/lib/expenses';
import { getBills } from '@/lib/bills';
import { getChemPurchases, getChemUsage } from '@/lib/chemicals';
import { getPayments } from '@/lib/payments';

/* ──────────────────── state ──────────────────── */

interface State {
  isLoggedIn: boolean;
  currentPage: string;
  selectedClientId: string | null;
  selectedSlipId: string | null;
  articles: Article[];
  clients: Client[];
  productions: Production[];
  expenses: Expense[];
  bills: Bill[];
  chemPurchases: ChemPurchase[];
  chemUsage: ChemUsage[];
  payments: Payment[];
  settings: { username: string };
}

type Action =
  | { type: 'LOGIN_SUCCESS'; payload: { username: string } }
  | { type: 'LOGOUT' }
  | { type: 'NAVIGATE'; page: string }
  | { type: 'SELECT_CLIENT'; clientId: string }
  | { type: 'SELECT_SLIP'; slipId: string }
  | { type: 'SET_ARTICLES'; articles: Article[] }
  | { type: 'SET_CLIENTS'; clients: Client[] }
  | { type: 'SET_PRODUCTIONS'; productions: Production[] }
  | { type: 'SET_EXPENSES'; expenses: Expense[] }
  | { type: 'SET_BILLS'; bills: Bill[] }
  | { type: 'SET_CHEM_PURCHASES'; chemPurchases: ChemPurchase[] }
  | { type: 'SET_CHEM_USAGE'; chemUsage: ChemUsage[] }
  | { type: 'SET_PAYMENTS'; payments: Payment[] }
  | { type: 'UPDATE_SETTINGS'; settings: { username: string } };

// No persisted session across launches — there's no token to restore, and
// every launch is a fresh OS process anyway (see DECISIONS.md's Group 5
// entry on why JWT/session persistence was dropped under IPC).
const initialState: State = {
  isLoggedIn: false,
  currentPage: 'login',
  selectedClientId: null,
  selectedSlipId: null,
  articles: [],
  clients: [],
  productions: [],
  expenses: [],
  bills: [],
  chemPurchases: [],
  chemUsage: [],
  payments: [],
  settings: { username: 'admin' },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOGIN_SUCCESS': {
      const { username } = action.payload;
      return {
        ...state,
        isLoggedIn: true,
        currentPage: 'home',
        settings: { ...state.settings, username },
      };
    }
    case 'LOGOUT':
      return { ...state, isLoggedIn: false, currentPage: 'login' };
    case 'NAVIGATE':
      return { ...state, currentPage: action.page };
    case 'SELECT_CLIENT':
      return { ...state, selectedClientId: action.clientId, selectedSlipId: null };
    case 'SELECT_SLIP':
      return { ...state, selectedSlipId: action.slipId };
    case 'SET_ARTICLES':
      return { ...state, articles: action.articles };
    case 'SET_CLIENTS':
      return { ...state, clients: action.clients };
    case 'SET_PRODUCTIONS':
      return { ...state, productions: action.productions };
    case 'SET_EXPENSES':
      return { ...state, expenses: action.expenses };
    case 'SET_BILLS':
      return { ...state, bills: action.bills };
    case 'SET_CHEM_PURCHASES':
      return { ...state, chemPurchases: action.chemPurchases };
    case 'SET_CHEM_USAGE':
      return { ...state, chemUsage: action.chemUsage };
    case 'SET_PAYMENTS':
      return { ...state, payments: action.payments };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: action.settings };
    default:
      return state;
  }
}

/* ──────────────────── context ──────────────────── */

interface ContextType {
  state: State;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<ContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    if (!state.isLoggedIn) return;
    getArticles()
      .then(articles => dispatch({ type: 'SET_ARTICLES', articles }))
      .catch(err => console.error('Failed to load articles:', err));
    getClients()
      .then(clients => dispatch({ type: 'SET_CLIENTS', clients }))
      .catch(err => console.error('Failed to load clients:', err));
    getProductions()
      .then(productions => dispatch({ type: 'SET_PRODUCTIONS', productions }))
      .catch(err => console.error('Failed to load productions:', err));
    getExpenses()
      .then(expenses => dispatch({ type: 'SET_EXPENSES', expenses }))
      .catch(err => console.error('Failed to load expenses:', err));
    getBills()
      .then(bills => dispatch({ type: 'SET_BILLS', bills }))
      .catch(err => console.error('Failed to load bills:', err));
    getChemPurchases()
      .then(chemPurchases => dispatch({ type: 'SET_CHEM_PURCHASES', chemPurchases }))
      .catch(err => console.error('Failed to load chemical purchases:', err));
    getChemUsage()
      .then(chemUsage => dispatch({ type: 'SET_CHEM_USAGE', chemUsage }))
      .catch(err => console.error('Failed to load chemical usage:', err));
    getPayments()
      .then(payments => dispatch({ type: 'SET_PAYMENTS', payments }))
      .catch(err => console.error('Failed to load payments:', err));
  }, [state.isLoggedIn]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

/* ──────────────────── helpers ──────────────────── */

export function formatCurrency(value: number): string {
  return '\u20A8 ' + Math.round(value).toLocaleString('en-US');
}

export function getCurrentWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff));
}

export function getCurrentWeekEnd(): Date {
  const start = getCurrentWeekStart();
  return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
}

export function isDateInCurrentWeek(dateStr: string): boolean {
  const date = new Date(dateStr);
  return date >= getCurrentWeekStart() && date <= getCurrentWeekEnd();
}

export function isDateInCurrentMonth(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

export function isDateInMonth(dateStr: string, month: number, year: number): boolean {
  const date = new Date(dateStr);
  return date.getMonth() === month && date.getFullYear() === year;
}

export function getMonthName(m: number): string {
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return names[m];
}

export function getPairsSold(slip: Slip): number {
  return slip.items.reduce((sum, item) => sum + item.qty, 0);
}

export function getWeekRange(): string {
  const start = getCurrentWeekStart();
  const end = getCurrentWeekEnd();
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
