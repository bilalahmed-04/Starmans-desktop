import { getPool, sql } from '../mssqlDb.js';

function mapRow(row) {
  return {
    id: String(row.Id),
    date: row.Date.toISOString().slice(0, 10),
    qty: Number(row.Qty),
    cost: Number(row.Cost),
  };
}

// month is 'YYYY-MM' — real DATE range comparison, not the old string-regex match
// (see EFFORT_ANALYSIS.md §1.2 item 4).
export async function findChemPurchases({ month } = {}) {
  const request = getPool().request();
  let query = 'SELECT Id, Date, Qty, Cost FROM dbo.ChemPurchases WHERE 1=1';
  if (month) {
    const start = `${month}-01`;
    request.input('start', sql.Date, start);
    request.input('end', sql.Date, start);
    query += ' AND Date >= @start AND Date < DATEADD(MONTH, 1, @end)';
  }
  query += ' ORDER BY Date, Id';
  const result = await request.query(query);
  return result.recordset.map(mapRow);
}

export async function createChemPurchase({ date, qty, cost }) {
  const result = await getPool().request()
    .input('date', sql.Date, date)
    .input('qty', sql.Decimal(10, 2), qty)
    .input('cost', sql.Decimal(10, 2), cost)
    .query(`INSERT INTO dbo.ChemPurchases (Date, Qty, Cost)
            OUTPUT INSERTED.Id, INSERTED.Date, INSERTED.Qty, INSERTED.Cost
            VALUES (@date, @qty, @cost)`);
  return mapRow(result.recordset[0]);
}

export async function sumChemPurchasedQty(request) {
  const result = await request.query('SELECT ISNULL(SUM(Qty), 0) AS total FROM dbo.ChemPurchases WITH (HOLDLOCK)');
  return Number(result.recordset[0].total);
}
