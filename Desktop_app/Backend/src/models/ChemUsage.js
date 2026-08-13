import { getPool, sql } from '../mssqlDb.js';
import { sumChemPurchasedQty } from './ChemPurchase.js';

function mapRow(row) {
  return {
    id: String(row.Id),
    date: row.Date.toISOString().slice(0, 10),
    qty: Number(row.Qty),
  };
}

export async function findChemUsages({ month } = {}) {
  const request = getPool().request();
  let query = 'SELECT Id, Date, Qty FROM dbo.ChemUsages WHERE 1=1';
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

export async function getChemSummary() {
  const pool = getPool();
  const purchasedResult = await pool.request().query('SELECT ISNULL(SUM(Qty), 0) AS total FROM dbo.ChemPurchases');
  const usedResult = await pool.request().query('SELECT ISNULL(SUM(Qty), 0) AS total FROM dbo.ChemUsages');
  const totalPurchased = Number(purchasedResult.recordset[0].total);
  const totalUsed = Number(usedResult.recordset[0].total);
  return { totalPurchased, totalUsed, remaining: totalPurchased - totalUsed };
}

export class InsufficientStockError extends Error {
  constructor(remaining) {
    super(`Usage exceeds remaining stock. Only ${remaining} kg available.`);
    this.remaining = remaining;
  }
}

// Validate-then-insert wrapped in a SERIALIZABLE transaction with HOLDLOCK
// reads, so two concurrent submissions can't both pass the remaining-stock
// check against the same pre-insert totals — same race-condition class as
// the stock-deduction fix required in Task 9 (see TASKS.md).
export async function createChemUsagesWithStockCheck(entries) {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const totalPurchased = await sumChemPurchasedQty(new sql.Request(transaction));
    const usedResult = await new sql.Request(transaction)
      .query('SELECT ISNULL(SUM(Qty), 0) AS total FROM dbo.ChemUsages WITH (HOLDLOCK)');
    const totalUsed = Number(usedResult.recordset[0].total);
    const remaining = totalPurchased - totalUsed;

    const requestedQty = entries.reduce((s, e) => s + Number(e.qty), 0);
    if (requestedQty > remaining) {
      throw new InsufficientStockError(remaining);
    }

    const created = [];
    for (const entry of entries) {
      const result = await new sql.Request(transaction)
        .input('date', sql.Date, entry.date)
        .input('qty', sql.Decimal(10, 2), Number(entry.qty))
        .query(`INSERT INTO dbo.ChemUsages (Date, Qty)
                OUTPUT INSERTED.Id, INSERTED.Date, INSERTED.Qty
                VALUES (@date, @qty)`);
      created.push(mapRow(result.recordset[0]));
    }

    await transaction.commit();
    return created;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
