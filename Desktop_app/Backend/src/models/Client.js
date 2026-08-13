import { getPool, sql } from '../mssqlDb.js';

function mapSlipItemRow(row) {
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
    id: String(row.SlipId),
    no: row.No,
    date: row.Date.toISOString().slice(0, 10),
    time: row.Time,
    items,
    total: Number(row.Total),
  };
}

// Fetches every Slip + its SlipItems in two queries (not N+1 per client),
// grouped in JS by ClientId. Returns a Map<ClientId, Slip[]>.
async function fetchSlipsByClientId(pool) {
  const slipsResult = await pool.request().query(
    'SELECT Id AS SlipId, No, ClientId, Date, Time, Total FROM dbo.Slips ORDER BY Id'
  );
  const slipIds = slipsResult.recordset.map(r => r.SlipId);

  const itemsBySlip = new Map();
  if (slipIds.length > 0) {
    const itemsResult = await pool.request().query(
      'SELECT SlipId, Name, Qty, Price, Subtotal, DiscountType, DiscountAmount, DiscountPct, Amount, Description, Size, Color FROM dbo.SlipItems ORDER BY SlipId, Id'
    );
    for (const row of itemsResult.recordset) {
      if (!itemsBySlip.has(row.SlipId)) itemsBySlip.set(row.SlipId, []);
      itemsBySlip.get(row.SlipId).push(mapSlipItemRow(row));
    }
  }

  const slipsByClient = new Map();
  for (const row of slipsResult.recordset) {
    const slip = mapSlipRow(row, itemsBySlip.get(row.SlipId) || []);
    if (!slipsByClient.has(row.ClientId)) slipsByClient.set(row.ClientId, []);
    slipsByClient.get(row.ClientId).push(slip);
  }
  return slipsByClient;
}

export async function findClients() {
  const pool = getPool();
  const clientsResult = await pool.request().query('SELECT Id, Name, Phone FROM dbo.Clients ORDER BY Id');
  const slipsByClient = await fetchSlipsByClientId(pool);
  return clientsResult.recordset.map(row => ({
    id: String(row.Id),
    name: row.Name,
    phone: row.Phone,
    slips: slipsByClient.get(row.Id) || [],
  }));
}

export async function findClientById(id) {
  const pool = getPool();
  const clientResult = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT Id, Name, Phone FROM dbo.Clients WHERE Id = @id');
  const row = clientResult.recordset[0];
  if (!row) return null;

  const slipsResult = await pool.request()
    .input('clientId', sql.Int, id)
    .query('SELECT Id AS SlipId, No, ClientId, Date, Time, Total FROM dbo.Slips WHERE ClientId = @clientId ORDER BY Id');
  const slipIds = slipsResult.recordset.map(r => r.SlipId);

  const itemsBySlip = new Map();
  if (slipIds.length > 0) {
    const itemsResult = await pool.request()
      .input('clientId', sql.Int, id)
      .query(`SELECT si.SlipId, si.Name, si.Qty, si.Price, si.Subtotal, si.DiscountType, si.DiscountAmount, si.DiscountPct, si.Amount, si.Description, si.Size, si.Color
              FROM dbo.SlipItems si
              JOIN dbo.Slips s ON s.Id = si.SlipId
              WHERE s.ClientId = @clientId
              ORDER BY si.SlipId, si.Id`);
    for (const item of itemsResult.recordset) {
      if (!itemsBySlip.has(item.SlipId)) itemsBySlip.set(item.SlipId, []);
      itemsBySlip.get(item.SlipId).push(mapSlipItemRow(item));
    }
  }

  return {
    id: String(row.Id),
    name: row.Name,
    phone: row.Phone,
    slips: slipsResult.recordset.map(s => mapSlipRow(s, itemsBySlip.get(s.SlipId) || [])),
  };
}

// Case-insensitive by LOWER() rather than relying on the server's default
// collation being _CI_AS — not yet verified for this instance (EFFORT_ANALYSIS.md §1.2 item 5).
export async function findClientByNameCaseInsensitive(name) {
  const pool = getPool();
  const result = await pool.request()
    .input('name', sql.NVarChar(255), name)
    .query('SELECT Id, Name, Phone FROM dbo.Clients WHERE LOWER(Name) = LOWER(@name)');
  const row = result.recordset[0];
  if (!row) return null;
  return { id: String(row.Id), name: row.Name, phone: row.Phone };
}

export async function createClient({ name, phone }) {
  const pool = getPool();
  const result = await pool.request()
    .input('name', sql.NVarChar(255), name)
    .input('phone', sql.NVarChar(50), phone)
    .query(`INSERT INTO dbo.Clients (Name, Phone)
            OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Phone
            VALUES (@name, @phone)`);
  const row = result.recordset[0];
  return { id: String(row.Id), name: row.Name, phone: row.Phone };
}
