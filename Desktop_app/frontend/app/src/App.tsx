import { useApp } from '@/context/AppContext';
import LoginPage from '@/pages/LoginPage';
import Home from '@/pages/Home';
import NewSalePage from '@/pages/NewSalePage';
import SlipsPage from '@/pages/SlipsPage';
import ClientDetailPage from '@/pages/ClientDetailPage';
import SlipDetailPage from '@/pages/SlipDetailPage';
import ProductionPage from '@/pages/ProductionPage';
import StockPage from '@/pages/StockPage';
import BillsPage from '@/pages/BillsPage';
import ChemicalPage from '@/pages/ChemicalPage';
import ExpensesPage from '@/pages/ExpensesPage';
import ProfitPage from '@/pages/ProfitPage';
import PaymentPage from '@/pages/PaymentPage';
import SettingsPage from '@/pages/SettingsPage';
import BackupPage from '@/pages/BackupPage';
import CheckForUpdatesPage from '@/pages/CheckForUpdatesPage';
import './App.css';

export default function App() {
  const { state } = useApp();

  if (!state.isLoggedIn) {
    return <LoginPage />;
  }

  const page = state.currentPage;

  // Home
  if (page === 'home') return <Home />;

  // Slips pages
  if (page.startsWith('slips')) return <SlipsPage />;
  if (page === 'client-detail') return <ClientDetailPage />;
  if (page === 'slip-detail') return <SlipDetailPage />;

  // Production
  if (page.startsWith('production')) return <ProductionPage />;

  // Stock
  if (page === 'stock') return <StockPage />;

  // Bills
  if (page.startsWith('bills')) return <BillsPage />;

  // Chemical
  if (page.startsWith('chemical')) return <ChemicalPage />;

  // Expenses
  if (page.startsWith('expenses')) return <ExpensesPage />;

  // Profit
  if (page.startsWith('profit')) return <ProfitPage />;

  // Payment
  if (page.startsWith('payment')) return <PaymentPage />;

  // Settings
  if (page === 'settings') return <SettingsPage />;

  // Backup
  if (page === 'backup') return <BackupPage />;

  // Updates
  if (page === 'updates') return <CheckForUpdatesPage />;

  // Default
  return <NewSalePage />;
}
