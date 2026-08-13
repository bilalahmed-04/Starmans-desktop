import { getPool, sql } from '../mssqlDb.js';

function mapEntryRow(row) {
  return { name: row.Name, amount: Number(row.Amount) };
}

function mapBillRow(row, entries) {
  return {
    id: String(row.Id),
    date: row.Date.toISOString().slice(0, 10),
    month: row.Month,
    entries,
  };
}

// month here is the 'YYYY-MM' filter param — real DATE range comparison,
// not the old string-regex match (see EFFORT_ANALYSIS.md §1.2 item 4).
// Not to be confused with the stored Bill.Month column ("August 2026" display string).
export async function findBills({ month } = {}) {
  const pool = getPool();
  const request = pool.request();
  let query = 'SELECT Id, Date, Month FROM dbo.Bills WHERE 1=1';
  if (month) {
    const start = `${month}-01`;
    request.input('start', sql.Date, start);
    query += ' AND Date >= @start AND Date < DATEADD(MONTH, 1, @start)';
  }
  query += ' ORDER BY Date, Id';
  const billsResult = await request.query(query);
  const billIds = billsResult.recordset.map(r => r.Id);

  const entriesByBill = new Map();
  if (billIds.length > 0) {
    const entriesResult = await pool.request().query(
      'SELECT BillId, Name, Amount FROM dbo.BillEntries ORDER BY BillId, Id'
    );
    for (const row of entriesResult.recordset) {
      if (!entriesByBill.has(row.BillId)) entriesByBill.set(row.BillId, []);
      entriesByBill.get(row.BillId).push(mapEntryRow(row));
    }
  }

  return billsResult.recordset.map(row => mapBillRow(row, entriesByBill.get(row.Id) || []));
}

export async function createBillWithEntries({ date, month, entries }) {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const billResult = await new sql.Request(transaction)
      .input('date', sql.Date, date)
      .input('month', sql.NVarChar(50), month)
      .query(`INSERT INTO dbo.Bills (Date, Month)
              OUTPUT INSERTED.Id, INSERTED.Date, INSERTED.Month
              VALUES (@date, @month)`);
    const billRow = billResult.recordset[0];

    const insertedEntries = [];
    for (const entry of entries) {
      await new sql.Request(transaction)
        .input('billId', sql.Int, billRow.Id)
        .input('name', sql.NVarChar(255), entry.name)
        .input('amount', sql.Decimal(10, 2), entry.amount)
        .query('INSERT INTO dbo.BillEntries (BillId, Name, Amount) VALUES (@billId, @name, @amount)');
      insertedEntries.push({ name: entry.name, amount: entry.amount });
    }

    await transaction.commit();
    return mapBillRow(billRow, insertedEntries);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
