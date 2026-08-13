import { Router } from 'express';
import { calcMonth, calcYear } from '../models/Profit.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function monthName(m) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][m];
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
    const allMonths = await calcYear(year);
    const months = allMonths.slice(0, currentMonth + 1).map(d => ({ ...d, monthName: monthName(d.month) }));
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
    const annualMonths = await calcYear(year);
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

export default router;
