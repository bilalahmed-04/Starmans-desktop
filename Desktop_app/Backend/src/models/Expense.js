import { getPool, sql } from '../mssqlDb.js';

function mapRowRow(row) {
  return { desc: row.Description, price: Number(row.Price) };
}

function mapExpenseRow(row, rows) {
  return {
    id: String(row.Id),
    date: row.Date.toISOString().slice(0, 10),
    time: row.Time,
    rows,
  };
}

// { month: 'YYYY-MM' } or { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } —
// real DATE range comparisons, not the old string-regex match
// (see EFFORT_ANALYSIS.md §1.2 item 4).
export async function findExpenses({ month, start, end } = {}) {
  const pool = getPool();
  const request = pool.request();
  let query = 'SELECT Id, Date, Time FROM dbo.Expenses WHERE 1=1';
  if (month) {
    const monthStart = `${month}-01`;
    request.input('monthStart', sql.Date, monthStart);
    query += ' AND Date >= @monthStart AND Date < DATEADD(MONTH, 1, @monthStart)';
  } else if (start && end) {
    request.input('start', sql.Date, start);
    request.input('end', sql.Date, end);
    query += ' AND Date >= @start AND Date <= @end';
  }
  query += ' ORDER BY Date, Id';
  const expensesResult = await request.query(query);
  const expenseIds = expensesResult.recordset.map(r => r.Id);

  const rowsByExpense = new Map();
  if (expenseIds.length > 0) {
    const rowsResult = await pool.request().query(
      'SELECT ExpenseId, Description, Price FROM dbo.ExpenseRows ORDER BY ExpenseId, Id'
    );
    for (const row of rowsResult.recordset) {
      if (!rowsByExpense.has(row.ExpenseId)) rowsByExpense.set(row.ExpenseId, []);
      rowsByExpense.get(row.ExpenseId).push(mapRowRow(row));
    }
  }

  return expensesResult.recordset.map(row => mapExpenseRow(row, rowsByExpense.get(row.Id) || []));
}

export async function createExpenseWithRows({ date, time, rows }) {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const expenseResult = await new sql.Request(transaction)
      .input('date', sql.Date, date)
      .input('time', sql.NVarChar(20), time)
      .query(`INSERT INTO dbo.Expenses (Date, Time)
              OUTPUT INSERTED.Id, INSERTED.Date, INSERTED.Time
              VALUES (@date, @time)`);
    const expenseRow = expenseResult.recordset[0];

    const insertedRows = [];
    for (const row of rows) {
      await new sql.Request(transaction)
        .input('expenseId', sql.Int, expenseRow.Id)
        .input('description', sql.NVarChar(500), row.desc)
        .input('price', sql.Decimal(10, 2), row.price)
        .query('INSERT INTO dbo.ExpenseRows (ExpenseId, Description, Price) VALUES (@expenseId, @description, @price)');
      insertedRows.push({ desc: row.desc, price: row.price });
    }

    await transaction.commit();
    return mapExpenseRow(expenseRow, insertedRows);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
