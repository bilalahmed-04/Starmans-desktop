import { getPool, sql } from '../mssqlDb.js';

function mapRow(row) {
  return {
    id: String(row.Id),
    date: row.Date.toISOString().slice(0, 10),
    time: row.Time,
    clientId: String(row.ClientId),
    clientName: row.ClientName,
    clientPhone: row.ClientPhone,
    method: row.Method,
    amount: Number(row.Amount),
    desc: row.Description,
    collectionDate: row.CollectionDate ? row.CollectionDate.toISOString().slice(0, 10) : undefined,
    chequeDate: row.ChequeDate ? row.ChequeDate.toISOString().slice(0, 10) : undefined,
  };
}

// SQL Server bracket-escapes LIKE wildcards without needing an ESCAPE clause.
function escapeLike(str) {
  return str.replace(/[%_[]/g, ch => `[${ch}]`);
}

// { month: 'YYYY-MM' } or { start, end } for real DATE range comparisons
// (EFFORT_ANALYSIS.md §1.2 item 4); `search` matches name/phone/method by
// substring, case-insensitively via LOWER() (see Task 3's collation note).
export async function findPayments({ month, start, end, search } = {}) {
  const request = getPool().request();
  let query = 'SELECT Id, Date, Time, ClientId, ClientName, ClientPhone, Method, Amount, Description, CollectionDate, ChequeDate FROM dbo.Payments WHERE 1=1';
  if (month) {
    const monthStart = `${month}-01`;
    request.input('monthStart', sql.Date, monthStart);
    query += ' AND Date >= @monthStart AND Date < DATEADD(MONTH, 1, @monthStart)';
  } else if (start && end) {
    request.input('start', sql.Date, start);
    request.input('end', sql.Date, end);
    query += ' AND Date >= @start AND Date <= @end';
  }
  if (search) {
    request.input('search', sql.NVarChar(255), `%${escapeLike(search)}%`);
    query += ` AND (LOWER(ClientName) LIKE LOWER(@search) OR ClientPhone LIKE @search OR LOWER(Method) LIKE LOWER(@search))`;
  }
  query += ' ORDER BY Date, Id';
  const result = await request.query(query);
  return result.recordset.map(mapRow);
}

export async function createPayment({ clientId, clientName, clientPhone, date, time, method, amount, desc, collectionDate, chequeDate }) {
  const result = await getPool().request()
    .input('clientId', sql.Int, clientId)
    .input('date', sql.Date, date)
    .input('time', sql.NVarChar(20), time)
    .input('clientName', sql.NVarChar(255), clientName)
    .input('clientPhone', sql.NVarChar(50), clientPhone)
    .input('method', sql.NVarChar(20), method)
    .input('amount', sql.Decimal(12, 2), amount)
    .input('description', sql.NVarChar(500), desc || '')
    .input('collectionDate', sql.Date, collectionDate || null)
    .input('chequeDate', sql.Date, chequeDate || null)
    .query(`INSERT INTO dbo.Payments (ClientId, Date, Time, ClientName, ClientPhone, Method, Amount, Description, CollectionDate, ChequeDate)
            OUTPUT INSERTED.Id, INSERTED.Date, INSERTED.Time, INSERTED.ClientId, INSERTED.ClientName, INSERTED.ClientPhone,
                   INSERTED.Method, INSERTED.Amount, INSERTED.Description, INSERTED.CollectionDate, INSERTED.ChequeDate
            VALUES (@clientId, @date, @time, @clientName, @clientPhone, @method, @amount, @description, @collectionDate, @chequeDate)`);
  return mapRow(result.recordset[0]);
}
