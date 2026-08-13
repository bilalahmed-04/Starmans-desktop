import { getPool, sql } from '../mssqlDb.js';

export class InsufficientStockError extends Error {
  constructor(message) {
    super(message);
    this.code = 'insufficient_stock';
  }
}

export class PhoneConflictError extends Error {
  constructor(existingClient) {
    // Built here, not in the route/IPC layer — the message only depends on
    // domain data (existingClient.name), so a single source of truth avoids
    // the IPC path getting the raw 'phone_conflict' string instead of a
    // human-readable message (a real bug caught while wiring Task 14/15:
    // the old Express route reconstructed this message itself, which IPC,
    // calling the service layer directly, would have silently skipped).
    super(`This phone number is already registered to "${existingClient.name}".`);
    this.code = 'phone_conflict';
    this.existingClient = existingClient;
  }
}

function calcItemAmount(item) {
  const subtotal = item.qty * item.price;
  if (item.discountType === '%') return Math.max(0, subtotal - subtotal * (item.discountPct / 100));
  if (item.discountType === 'Rs') return Math.max(0, subtotal - item.discountAmount);
  return subtotal;
}

function mapItemRow(row) {
  return {
    name: row.Name,
    qty: row.Qty,
    price: Number(row.Price),
    subtotal: Number(row.Subtotal),
    discountType: row.DiscountType,
    discountAmount: Number(row.DiscountAmount),
    discountPct: Number(row.DiscountPct),
    amount: Number(row.Amount),
    desc: row.Description,
    size: row.Size,
    color: row.Color,
  };
}

function mapSlipRow(row, items) {
  return {
    id: String(row.Id),
    no: row.No,
    clientId: String(row.ClientId),
    clientName: row.ClientName || '',
    clientPhone: row.ClientPhone || '',
    date: row.Date.toISOString().slice(0, 10),
    time: row.Time,
    items,
    total: Number(row.Total),
  };
}

// { clientId, month: 'YYYY-MM' } or { clientId, start, end } ('YYYY-MM-DD') —
// real SQL JOIN against Clients (replacing .populate()) and real DATE range
// comparisons (not the old string-regex match — EFFORT_ANALYSIS.md §1.2 item 4).
export async function findSlips({ clientId, month, start, end } = {}) {
  const pool = getPool();
  const request = pool.request();
  let query = `SELECT s.Id, s.No, s.ClientId, s.Date, s.Time, s.Total, c.Name AS ClientName, c.Phone AS ClientPhone
               FROM dbo.Slips s JOIN dbo.Clients c ON c.Id = s.ClientId WHERE 1=1`;
  if (clientId) {
    request.input('clientId', sql.Int, Number(clientId));
    query += ' AND s.ClientId = @clientId';
  }
  if (month) {
    const monthStart = `${month}-01`;
    request.input('monthStart', sql.Date, monthStart);
    query += ' AND s.Date >= @monthStart AND s.Date < DATEADD(MONTH, 1, @monthStart)';
  } else if (start && end) {
    request.input('start', sql.Date, start);
    request.input('end', sql.Date, end);
    query += ' AND s.Date >= @start AND s.Date <= @end';
  }
  query += ' ORDER BY s.Date, s.Id';
  const slipsResult = await request.query(query);
  const slipIds = slipsResult.recordset.map(r => r.Id);

  const itemsBySlip = new Map();
  if (slipIds.length > 0) {
    const itemsResult = await pool.request().query(
      'SELECT SlipId, Name, Qty, Price, Subtotal, DiscountType, DiscountAmount, DiscountPct, Amount, Description, Size, Color FROM dbo.SlipItems ORDER BY SlipId, Id'
    );
    for (const row of itemsResult.recordset) {
      if (!itemsBySlip.has(row.SlipId)) itemsBySlip.set(row.SlipId, []);
      itemsBySlip.get(row.SlipId).push(mapItemRow(row));
    }
  }

  return slipsResult.recordset.map(row => mapSlipRow(row, itemsBySlip.get(row.Id) || []));
}

export async function findSlipById(id) {
  const pool = getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query(`SELECT s.Id, s.No, s.ClientId, s.Date, s.Time, s.Total, c.Name AS ClientName, c.Phone AS ClientPhone
            FROM dbo.Slips s JOIN dbo.Clients c ON c.Id = s.ClientId WHERE s.Id = @id`);
  const row = result.recordset[0];
  if (!row) return null;
  const itemsResult = await pool.request()
    .input('slipId', sql.Int, id)
    .query('SELECT Name, Qty, Price, Subtotal, DiscountType, DiscountAmount, DiscountPct, Amount, Description, Size, Color FROM dbo.SlipItems WHERE SlipId = @slipId ORDER BY Id');
  return mapSlipRow(row, itemsResult.recordset.map(mapItemRow));
}

async function findClientByPhoneAndName(transaction, phone, name) {
  const result = await new sql.Request(transaction)
    .input('phone', sql.NVarChar(50), phone)
    .input('name', sql.NVarChar(255), name)
    .query('SELECT Id, Name, Phone FROM dbo.Clients WHERE Phone = @phone AND LOWER(Name) = LOWER(@name)');
  return result.recordset[0] || null;
}

async function findClientByPhoneOnly(transaction, phone) {
  const result = await new sql.Request(transaction)
    .input('phone', sql.NVarChar(50), phone)
    .query('SELECT Id, Name, Phone FROM dbo.Clients WHERE Phone = @phone');
  return result.recordset[0] || null;
}

async function insertClient(transaction, name, phone) {
  const result = await new sql.Request(transaction)
    .input('name', sql.NVarChar(255), name)
    .input('phone', sql.NVarChar(50), phone)
    .query('INSERT INTO dbo.Clients (Name, Phone) OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Phone VALUES (@name, @phone)');
  return result.recordset[0];
}

async function insertSlipItem(transaction, slipId, item) {
  await new sql.Request(transaction)
    .input('slipId', sql.Int, slipId)
    .input('name', sql.NVarChar(255), item.name)
    .input('qty', sql.Int, item.qty)
    .input('price', sql.Decimal(10, 2), item.price)
    .input('subtotal', sql.Decimal(12, 2), item.subtotal)
    .input('discountType', sql.NVarChar(5), item.discountType || null)
    .input('discountAmount', sql.Decimal(10, 2), item.discountAmount || 0)
    .input('discountPct', sql.Decimal(5, 2), item.discountPct || 0)
    .input('amount', sql.Decimal(12, 2), item.amount)
    .input('description', sql.NVarChar(500), item.desc || '')
    .input('size', sql.NVarChar(50), item.size || '')
    .input('color', sql.NVarChar(100), item.color || '')
    .query(`INSERT INTO dbo.SlipItems (SlipId, Name, Qty, Price, Subtotal, DiscountType, DiscountAmount, DiscountPct, Amount, Description, Size, Color)
            VALUES (@slipId, @name, @qty, @price, @subtotal, @discountType, @discountAmount, @discountPct, @amount, @description, @size, @color)`);
}

// Locks the distinct Articles rows involved (sorted by name for a consistent
// lock-acquisition order across concurrent transactions, avoiding deadlocks),
// validates requested vs. available, then deducts — all inside the caller's
// transaction. This is the fix for the check-then-deduct race condition the
// old two-loop Mongo version had (see TASKS.md Task 9): the row locks
// (UPDLOCK/ROWLOCK) held from the check through the deduct mean a second,
// concurrent slip for the same article can't interleave between them.
async function checkAndDeductStock(transaction, items) {
  const qtys = {};
  for (const item of items) qtys[item.name] = (qtys[item.name] || 0) + item.qty;
  const names = Object.keys(qtys).sort();

  const locked = {};
  for (const name of names) {
    const result = await new sql.Request(transaction)
      .input('name', sql.NVarChar(255), name)
      .query('SELECT Id, Stock FROM dbo.Articles WITH (UPDLOCK, ROWLOCK) WHERE Name = @name');
    locked[name] = result.recordset[0] || null;
  }
  for (const name of names) {
    const available = locked[name]?.Stock ?? 0;
    const requested = qtys[name];
    if (requested > available) {
      throw new InsufficientStockError(`${name}: requested ${requested} but only ${available} in stock`);
    }
  }
  for (const name of names) {
    if (!locked[name]) continue; // matches old behavior: a missing article is a silent no-op deduction
    await new sql.Request(transaction)
      .input('articleId', sql.Int, locked[name].Id)
      .input('qty', sql.Int, qtys[name])
      .query('UPDATE dbo.Articles SET Stock = Stock - @qty WHERE Id = @articleId');
  }
}

async function restoreStock(transaction, items) {
  const qtys = {};
  for (const item of items) qtys[item.name] = (qtys[item.name] || 0) + item.qty;
  for (const name of Object.keys(qtys).sort()) {
    const result = await new sql.Request(transaction)
      .input('name', sql.NVarChar(255), name)
      .query('SELECT Id FROM dbo.Articles WITH (UPDLOCK, ROWLOCK) WHERE Name = @name');
    const row = result.recordset[0];
    if (!row) continue;
    await new sql.Request(transaction)
      .input('articleId', sql.Int, row.Id)
      .input('qty', sql.Int, qtys[name])
      .query('UPDATE dbo.Articles SET Stock = Stock + @qty WHERE Id = @articleId');
  }
}

// Client dedupe/phone-conflict flow — preserved exactly from the old Mongo
// version (see TASKS.md Task 9), only the persistence calls changed:
// phone is the identity key; a phone match with a differing name requires
// `clientResolution` ('existing' | 'new') or gets a 409 phone_conflict.
export async function createSlip({ clientName, clientPhone, clientResolution, items }) {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const trimmedName = clientName.trim();
    const trimmedPhone = clientPhone.trim();

    let client = await findClientByPhoneAndName(transaction, trimmedPhone, trimmedName);
    if (!client) client = await findClientByPhoneOnly(transaction, trimmedPhone);

    if (client && client.Name.trim().toLowerCase() !== trimmedName.toLowerCase()) {
      if (clientResolution === 'existing') {
        // Attach this sale to the existing customer under their stored name.
      } else if (clientResolution === 'new') {
        client = await insertClient(transaction, trimmedName, trimmedPhone);
      } else {
        throw new PhoneConflictError({ id: String(client.Id), name: client.Name, phone: client.Phone });
      }
    } else if (!client) {
      client = await insertClient(transaction, trimmedName, trimmedPhone);
    }

    await checkAndDeductStock(transaction, items);

    const now = new Date();
    const enrichedItems = items.map(it => ({ ...it, subtotal: it.qty * it.price, amount: calcItemAmount(it) }));
    const total = enrichedItems.reduce((s, it) => s + it.amount, 0);
    const no = 'SL-' + (Math.floor(Math.random() * 9000) + 1000);
    const date = now.toISOString().split('T')[0];
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const slipResult = await new sql.Request(transaction)
      .input('no', sql.NVarChar(50), no)
      .input('clientId', sql.Int, client.Id)
      .input('date', sql.Date, date)
      .input('time', sql.NVarChar(20), time)
      .input('total', sql.Decimal(12, 2), total)
      .query(`INSERT INTO dbo.Slips (No, ClientId, Date, Time, Total)
              OUTPUT INSERTED.Id
              VALUES (@no, @clientId, @date, @time, @total)`);
    const slipId = slipResult.recordset[0].Id;

    for (const item of enrichedItems) {
      await insertSlipItem(transaction, slipId, item);
    }

    await transaction.commit();
    return {
      id: String(slipId),
      no,
      clientId: String(client.Id),
      clientName: client.Name,
      clientPhone: client.Phone,
      date,
      time,
      items: enrichedItems,
      total,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// Restore-old-then-deduct-new in a single transaction: if the new deduction
// fails, ROLLBACK undoes the restore too, leaving stock exactly as it was
// before the call. The old Mongo version restored, then on failure restored
// *again* before re-deducting the old items — a bug that permanently
// inflated stock by the old items' quantity on every failed edit. Not ported.
export async function updateSlipItems(id, items) {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const slipResult = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`SELECT s.Id, s.No, s.ClientId, s.Date, s.Time, c.Name AS ClientName, c.Phone AS ClientPhone
              FROM dbo.Slips s JOIN dbo.Clients c ON c.Id = s.ClientId WHERE s.Id = @id`);
    const slipRow = slipResult.recordset[0];
    if (!slipRow) {
      await transaction.rollback();
      return null;
    }

    const oldItemsResult = await new sql.Request(transaction)
      .input('slipId', sql.Int, id)
      .query('SELECT Name, Qty, Price, Subtotal, DiscountType, DiscountAmount, DiscountPct, Amount, Description, Size, Color FROM dbo.SlipItems WHERE SlipId = @slipId');
    const oldItems = oldItemsResult.recordset.map(mapItemRow);

    await restoreStock(transaction, oldItems);
    await checkAndDeductStock(transaction, items);

    const enrichedItems = items.map(it => ({ ...it, subtotal: it.qty * it.price, amount: calcItemAmount(it) }));
    const total = enrichedItems.reduce((s, it) => s + it.amount, 0);

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('total', sql.Decimal(12, 2), total)
      .query('UPDATE dbo.Slips SET Total = @total WHERE Id = @id');

    await new sql.Request(transaction)
      .input('slipId', sql.Int, id)
      .query('DELETE FROM dbo.SlipItems WHERE SlipId = @slipId');

    for (const item of enrichedItems) {
      await insertSlipItem(transaction, id, item);
    }

    await transaction.commit();
    return {
      id: String(slipRow.Id),
      no: slipRow.No,
      clientId: String(slipRow.ClientId),
      clientName: slipRow.ClientName,
      clientPhone: slipRow.ClientPhone,
      date: slipRow.Date.toISOString().slice(0, 10),
      time: slipRow.Time,
      items: enrichedItems,
      total,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function deleteSlip(id) {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const slipCheck = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query('SELECT Id FROM dbo.Slips WHERE Id = @id');
    if (!slipCheck.recordset[0]) {
      await transaction.rollback();
      return false;
    }

    const itemsResult = await new sql.Request(transaction)
      .input('slipId', sql.Int, id)
      .query('SELECT Name, Qty, Price, Subtotal, DiscountType, DiscountAmount, DiscountPct, Amount, Description, Size, Color FROM dbo.SlipItems WHERE SlipId = @slipId');
    await restoreStock(transaction, itemsResult.recordset.map(mapItemRow));

    // SlipItems cascade-deleted via FK (ON DELETE CASCADE, see 001_initial_schema.sql)
    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.Slips WHERE Id = @id');

    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
