import { Router } from 'express';
import Slip from '../models/Slip.js';
import Expense from '../models/Expense.js';
import Bill from '../models/Bill.js';
import ChemPurchase from '../models/ChemPurchase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

async function calcMonth(month, year) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  const [slips, expenses, bills, chemPurchases] = await Promise.all([
    Slip.find({ date: { $regex: `^${prefix}` } }),
    Expense.find({ date: { $regex: `^${prefix}` } }),
    Bill.find({ date: { $regex: `^${prefix}` } }),
    ChemPurchase.find({ date: { $regex: `^${prefix}` } }),
  ]);

  const grossSales        = slips.reduce((s, sl) => s + sl.total, 0);
  const operatingExpenses = expenses.reduce((s, e) => s + e.rows.reduce((rs, r) => rs + r.price, 0), 0);
  const utilityBills      = bills.reduce((s, b) => s + b.entries.reduce((es, e) => es + e.amount, 0), 0);
  const chemicalCosts     = chemPurchases.reduce((s, c) => s + c.cost, 0);
  const totalExpenses     = operatingExpenses + utilityBills + chemicalCosts;

  return { grossSales, operatingExpenses, utilityBills, chemicalCosts, totalExpenses, netProfit: grossSales - totalExpenses };
}

// GET /profit/monthly?month=YYYY-MM
router.get('/monthly', async (req, res) => {
  try {
    const raw = req.query.month || new Date().toISOString().slice(0, 7);
    const [year, month] = raw.split('-').map(Number);
    if (!year || !month) return res.status(400).json({ error: 'Provide ?month=YYYY-MM' });
    const data = await calcMonth(month - 1, year);
    res.json({ month: raw, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /profit/annual?year=YYYY
router.get('/annual', async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const months = await Promise.all(
      Array.from({ length: currentMonth + 1 }, (_, m) =>
        calcMonth(m, year).then(d => ({ month: m, monthName: monthName(m), ...d }))
      )
    );
    const totals = months.reduce(
      (acc, d) => ({
        grossSales:    acc.grossSales    + d.grossSales,
        totalExpenses: acc.totalExpenses + d.totalExpenses,
        netProfit:     acc.netProfit     + d.netProfit,
      }),
      { grossSales: 0, totalExpenses: 0, netProfit: 0 }
    );
    res.json({ year, months, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /profit/analytics?month=YYYY-MM&year=YYYY
router.get('/analytics', async (req, res) => {
  try {
    const rawMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const [mYear, mMonth] = rawMonth.split('-').map(Number);
    const year = Number(req.query.year) || mYear;
    if (!mYear || !mMonth) return res.status(400).json({ error: 'Provide ?month=YYYY-MM' });

    const monthly = await calcMonth(mMonth - 1, mYear);
    const annualMonths = await Promise.all(
      Array.from({ length: 12 }, (_, m) => calcMonth(m, year))
    );
    const annual = annualMonths.reduce(
      (acc, d) => ({
        grossSales:        acc.grossSales        + d.grossSales,
        operatingExpenses: acc.operatingExpenses + d.operatingExpenses,
        utilityBills:      acc.utilityBills      + d.utilityBills,
        chemicalCosts:     acc.chemicalCosts     + d.chemicalCosts,
        totalExpenses:     acc.totalExpenses     + d.totalExpenses,
        netProfit:         acc.netProfit         + d.netProfit,
      }),
      { grossSales: 0, operatingExpenses: 0, utilityBills: 0, chemicalCosts: 0, totalExpenses: 0, netProfit: 0 }
    );

    res.json({ month: rawMonth, year, monthly, annual });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function monthName(m) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][m];
}

export default router;
