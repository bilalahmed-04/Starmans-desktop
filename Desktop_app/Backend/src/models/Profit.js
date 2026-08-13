import { getPool, sql } from '../mssqlDb.js';

// grossSales sums Slips.Total directly — NOT via a JOIN to SlipItems, which
// would fan out one row per item and inflate the sum by item count for any
// slip with more than one item (see EFFORT_ANALYSIS.md §3 item 2).
export async function calcMonth(month, year) {
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const pool = getPool();

  const [grossSalesResult, operatingExpensesResult, utilityBillsResult, chemicalCostsResult] = await Promise.all([
    pool.request().input('monthStart', sql.Date, monthStart)
      .query('SELECT ISNULL(SUM(Total), 0) AS total FROM dbo.Slips WHERE Date >= @monthStart AND Date < DATEADD(MONTH, 1, @monthStart)'),
    pool.request().input('monthStart', sql.Date, monthStart)
      .query(`SELECT ISNULL(SUM(er.Price), 0) AS total
              FROM dbo.ExpenseRows er JOIN dbo.Expenses e ON e.Id = er.ExpenseId
              WHERE e.Date >= @monthStart AND e.Date < DATEADD(MONTH, 1, @monthStart)`),
    pool.request().input('monthStart', sql.Date, monthStart)
      .query(`SELECT ISNULL(SUM(be.Amount), 0) AS total
              FROM dbo.BillEntries be JOIN dbo.Bills b ON b.Id = be.BillId
              WHERE b.Date >= @monthStart AND b.Date < DATEADD(MONTH, 1, @monthStart)`),
    pool.request().input('monthStart', sql.Date, monthStart)
      .query('SELECT ISNULL(SUM(Cost), 0) AS total FROM dbo.ChemPurchases WHERE Date >= @monthStart AND Date < DATEADD(MONTH, 1, @monthStart)'),
  ]);

  const grossSales = Number(grossSalesResult.recordset[0].total);
  const operatingExpenses = Number(operatingExpensesResult.recordset[0].total);
  const utilityBills = Number(utilityBillsResult.recordset[0].total);
  const chemicalCosts = Number(chemicalCostsResult.recordset[0].total);
  const totalExpenses = operatingExpenses + utilityBills + chemicalCosts;

  return { grossSales, operatingExpenses, utilityBills, chemicalCosts, totalExpenses, netProfit: grossSales - totalExpenses };
}

// Returns all 12 months (index 0-11) for `year` in 4 GROUP BY queries total
// (one per source table), instead of the old code's Promise.all of up to 12
// separate per-month document fetches reduced in JS.
export async function calcYear(year) {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const pool = getPool();

  const [grossSalesRows, operatingExpenseRows, utilityBillRows, chemicalCostRows] = await Promise.all([
    pool.request().input('start', sql.Date, start).input('end', sql.Date, end)
      .query('SELECT MONTH(Date) AS m, SUM(Total) AS total FROM dbo.Slips WHERE Date >= @start AND Date < @end GROUP BY MONTH(Date)'),
    pool.request().input('start', sql.Date, start).input('end', sql.Date, end)
      .query(`SELECT MONTH(e.Date) AS m, SUM(er.Price) AS total
              FROM dbo.ExpenseRows er JOIN dbo.Expenses e ON e.Id = er.ExpenseId
              WHERE e.Date >= @start AND e.Date < @end GROUP BY MONTH(e.Date)`),
    pool.request().input('start', sql.Date, start).input('end', sql.Date, end)
      .query(`SELECT MONTH(b.Date) AS m, SUM(be.Amount) AS total
              FROM dbo.BillEntries be JOIN dbo.Bills b ON b.Id = be.BillId
              WHERE b.Date >= @start AND b.Date < @end GROUP BY MONTH(b.Date)`),
    pool.request().input('start', sql.Date, start).input('end', sql.Date, end)
      .query('SELECT MONTH(Date) AS m, SUM(Cost) AS total FROM dbo.ChemPurchases WHERE Date >= @start AND Date < @end GROUP BY MONTH(Date)'),
  ]);

  const toMap = rows => new Map(rows.recordset.map(r => [r.m, Number(r.total)]));
  const grossByMonth = toMap(grossSalesRows);
  const opByMonth = toMap(operatingExpenseRows);
  const utilByMonth = toMap(utilityBillRows);
  const chemByMonth = toMap(chemicalCostRows);

  const months = [];
  for (let m = 0; m < 12; m++) {
    const monthNum = m + 1; // SQL MONTH() is 1-indexed; our month index (m) is 0-indexed, matching the old code
    const grossSales = grossByMonth.get(monthNum) || 0;
    const operatingExpenses = opByMonth.get(monthNum) || 0;
    const utilityBills = utilByMonth.get(monthNum) || 0;
    const chemicalCosts = chemByMonth.get(monthNum) || 0;
    const totalExpenses = operatingExpenses + utilityBills + chemicalCosts;
    months.push({ month: m, grossSales, operatingExpenses, utilityBills, chemicalCosts, totalExpenses, netProfit: grossSales - totalExpenses });
  }
  return months;
}
