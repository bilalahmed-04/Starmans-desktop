import { calcMonth, calcYear } from '../models/Profit.js';
import { ValidationError } from './errors.js';

function monthName(m) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][m];
}

export async function getMonthly(rawMonth) {
  const raw = rawMonth || new Date().toISOString().slice(0, 7);
  const [year, month] = raw.split('-').map(Number);
  if (!year || !month) throw new ValidationError('Provide ?month=YYYY-MM');
  const data = await calcMonth(month - 1, year);
  return { month: raw, ...data };
}

export async function getAnnual(rawYear) {
  const year = Number(rawYear) || new Date().getFullYear();
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
  return { year, months, totals };
}

export async function getAnalytics(rawMonth, rawYear) {
  const monthStr = rawMonth || new Date().toISOString().slice(0, 7);
  const [mYear, mMonth] = monthStr.split('-').map(Number);
  const year = Number(rawYear) || mYear;
  if (!mYear || !mMonth) throw new ValidationError('Provide ?month=YYYY-MM');

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

  return { month: monthStr, year, monthly, annual };
}
