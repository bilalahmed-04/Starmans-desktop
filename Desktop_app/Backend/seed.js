/**
 * Seed the MSSQL database with demo data.
 * Run once: node seed.js
 * Re-running will wipe and re-seed every table.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectMSSQL, getPool, sql } from './src/mssqlDb.js';

await connectMSSQL();
const pool = getPool();

// ─── wipe (dependency order — children with ON DELETE CASCADE are covered
// automatically by their parent's delete; Clients/Articles go last since
// Slips/Payments/ProductionEntries reference them) ─────────────────────────
await pool.request().query('DELETE FROM dbo.Slips');
await pool.request().query('DELETE FROM dbo.Payments');
await pool.request().query('DELETE FROM dbo.Productions');
await pool.request().query('DELETE FROM dbo.Expenses');
await pool.request().query('DELETE FROM dbo.Bills');
await pool.request().query('DELETE FROM dbo.ChemPurchases');
await pool.request().query('DELETE FROM dbo.ChemUsages');
await pool.request().query('DELETE FROM dbo.Clients');
await pool.request().query('DELETE FROM dbo.Articles');
await pool.request().query('DELETE FROM dbo.Settings');
for (const table of ['Slips', 'Payments', 'Productions', 'Expenses', 'Bills', 'ChemPurchases', 'ChemUsages', 'Clients', 'Articles', 'Settings']) {
  await pool.request().query(`DBCC CHECKIDENT ('dbo.${table}', RESEED, 0)`);
}
console.log('Tables cleared');

// ─── settings ───────────────────────────────────────────────────────────────
await pool.request()
  .input('username', sql.NVarChar(100), 'admin')
  .input('passwordHash', sql.NVarChar(255), await bcrypt.hash('admin', 10))
  .query('INSERT INTO dbo.Settings (Username, PasswordHash) VALUES (@username, @passwordHash)');

// ─── articles ───────────────────────────────────────────────────────────────
const articleDefs = [
  { name: 'Rubber Sole',   price: 380, stock: 80,  color: 'Brown',   size: '9-10'   },
  { name: 'TPR Sole',      price: 520, stock: 200, color: 'White',   size: '6-7'    },
  { name: 'Leather Sole',  price: 850, stock: 45,  color: 'Tan',     size: '8-9'    },
  { name: 'EVA Foam Sole', price: 290, stock: 15,  color: 'Grey',    size: 'Unisex' },
  { name: 'Crepe Sole',    price: 670, stock: 60,  color: 'Natural', size: '8-9'    },
  { name: 'PU Sole',       price: 490, stock: 90,  color: 'Black',   size: '10-11'  },
  { name: 'PVC Sole',      price: 450, stock: 120, color: 'Black',   size: '42-44'  },
];
const byName = {};
for (const a of articleDefs) {
  const result = await pool.request()
    .input('name', sql.NVarChar(255), a.name)
    .input('price', sql.Decimal(10, 2), a.price)
    .input('stock', sql.Int, a.stock)
    .input('color', sql.NVarChar(100), a.color)
    .input('size', sql.NVarChar(50), a.size)
    .query('INSERT INTO dbo.Articles (Name, Price, Stock, Color, Size) OUTPUT INSERTED.Id VALUES (@name, @price, @stock, @color, @size)');
  byName[a.name] = result.recordset[0].Id;
}

// ─── clients ────────────────────────────────────────────────────────────────
const clientDefs = [
  { name: 'Ahmed Footwear', phone: '0300-1234567' },
  { name: 'Khan Shoe House', phone: '0312-9876543' },
  { name: 'Malik Traders',   phone: '0333-4567890' },
  { name: 'Bilal Shoe Mart', phone: '0301-7890123' },
  { name: 'Raza Brothers',   phone: '0321-3456789' },
];
const byClient = {};
for (const c of clientDefs) {
  const result = await pool.request()
    .input('name', sql.NVarChar(255), c.name)
    .input('phone', sql.NVarChar(50), c.phone)
    .query('INSERT INTO dbo.Clients (Name, Phone) OUTPUT INSERTED.Id VALUES (@name, @phone)');
  byClient[c.name] = result.recordset[0].Id;
}

// ─── slips ──────────────────────────────────────────────────────────────────
async function insertSlip({ no, clientName, date, time, total, items }) {
  const slipResult = await pool.request()
    .input('no', sql.NVarChar(50), no)
    .input('clientId', sql.Int, byClient[clientName])
    .input('date', sql.Date, date)
    .input('time', sql.NVarChar(20), time)
    .input('total', sql.Decimal(12, 2), total)
    .query('INSERT INTO dbo.Slips (No, ClientId, Date, Time, Total) OUTPUT INSERTED.Id VALUES (@no, @clientId, @date, @time, @total)');
  const slipId = slipResult.recordset[0].Id;
  for (const it of items) {
    await pool.request()
      .input('slipId', sql.Int, slipId)
      .input('name', sql.NVarChar(255), it.name)
      .input('qty', sql.Int, it.qty)
      .input('price', sql.Decimal(10, 2), it.price)
      .input('subtotal', sql.Decimal(12, 2), it.subtotal)
      .input('discountType', sql.NVarChar(5), it.discountType)
      .input('discountAmount', sql.Decimal(10, 2), it.discountAmount)
      .input('discountPct', sql.Decimal(5, 2), it.discountPct)
      .input('amount', sql.Decimal(12, 2), it.amount)
      .input('description', sql.NVarChar(500), it.desc || '')
      .input('size', sql.NVarChar(50), it.size)
      .input('color', sql.NVarChar(100), it.color)
      .query(`INSERT INTO dbo.SlipItems (SlipId, Name, Qty, Price, Subtotal, DiscountType, DiscountAmount, DiscountPct, Amount, Description, Size, Color)
              VALUES (@slipId, @name, @qty, @price, @subtotal, @discountType, @discountAmount, @discountPct, @amount, @description, @size, @color)`);
  }
}

await insertSlip({
  no: 'SL-1035', clientName: 'Ahmed Footwear', date: '2026-06-01', time: '10:30 AM', total: 14130,
  items: [
    { name: 'PVC Sole',    qty: 20, price: 450, subtotal: 9000, discountType: null, discountAmount: 0,   discountPct: 0,  amount: 9000, desc: '',              size: '42-44', color: 'Black' },
    { name: 'Rubber Sole', qty: 15, price: 380, subtotal: 5700, discountType: '%',  discountAmount: 570, discountPct: 10, amount: 5130, desc: 'Regular order', size: '40-42', color: 'Brown' },
  ],
});
await insertSlip({
  no: 'SL-1036', clientName: 'Khan Shoe House', date: '2026-06-03', time: '11:45 AM', total: 15000,
  items: [{ name: 'TPR Sole', qty: 30, price: 520, subtotal: 15600, discountType: 'Rs', discountAmount: 600, discountPct: 0, amount: 15000, desc: '', size: '41-43', color: 'Black' }],
});
await insertSlip({
  no: 'SL-1037', clientName: 'Malik Traders', date: '2026-06-05', time: '01:20 PM', total: 18625,
  items: [
    { name: 'Leather Sole', qty: 10, price: 850, subtotal: 8500,  discountType: null, discountAmount: 0,    discountPct: 0,  amount: 8500,  desc: 'Premium quality', size: '42-44', color: 'Tan'   },
    { name: 'PVC Sole',     qty: 25, price: 450, subtotal: 11250, discountType: '%',  discountAmount: 1125, discountPct: 10, amount: 10125, desc: '',               size: '42-44', color: 'Black' },
  ],
});
await insertSlip({
  no: 'SL-1038', clientName: 'Bilal Shoe Mart', date: '2026-06-08', time: '12:00 PM', total: 8820,
  items: [{ name: 'PU Sole', qty: 18, price: 490, subtotal: 8820, discountType: null, discountAmount: 0, discountPct: 0, amount: 8820, desc: '', size: '40-42', color: 'Black' }],
});
await insertSlip({
  no: 'SL-1039', clientName: 'Raza Brothers', date: '2026-06-10', time: '05:00 PM', total: 7540,
  items: [{ name: 'Crepe Sole', qty: 12, price: 670, subtotal: 8040, discountType: 'Rs', discountAmount: 500, discountPct: 0, amount: 7540, desc: 'Export quality', size: '41-43', color: 'Natural' }],
});
await insertSlip({
  no: 'SL-1040', clientName: 'Ahmed Footwear', date: '2026-06-15', time: '02:15 PM', total: 24080,
  items: [
    { name: 'Rubber Sole', qty: 40, price: 380, subtotal: 15200, discountType: '%',  discountAmount: 1520, discountPct: 10, amount: 13680, desc: 'Bulk order', size: '40-42', color: 'Brown' },
    { name: 'TPR Sole',    qty: 20, price: 520, subtotal: 10400, discountType: null, discountAmount: 0,    discountPct: 0,  amount: 10400, desc: '',           size: '41-43', color: 'Black' },
  ],
});
await insertSlip({
  no: 'SL-1041', clientName: 'Raza Brothers', date: '2026-06-20', time: '11:30 AM', total: 13500,
  items: [{ name: 'EVA Foam Sole', qty: 50, price: 290, subtotal: 14500, discountType: 'Rs', discountAmount: 1000, discountPct: 0, amount: 13500, desc: '', size: '38-40', color: 'White' }],
});
await insertSlip({
  no: 'SL-1042', clientName: 'Khan Shoe House', date: '2026-06-18', time: '09:00 AM', total: 14175,
  items: [{ name: 'PVC Sole', qty: 35, price: 450, subtotal: 15750, discountType: '%', discountAmount: 1575, discountPct: 10, amount: 14175, desc: 'Regular supply', size: '42-44', color: 'Black' }],
});
await insertSlip({
  no: 'SL-1043', clientName: 'Malik Traders', date: '2026-06-22', time: '03:45 PM', total: 16502,
  items: [
    { name: 'Leather Sole', qty: 8,  price: 850, subtotal: 6800,  discountType: null, discountAmount: 0,    discountPct: 0,  amount: 6800, desc: 'Handmade', size: '42-44', color: 'Tan'   },
    { name: 'PU Sole',      qty: 22, price: 490, subtotal: 10780, discountType: '%',  discountAmount: 1078, discountPct: 10, amount: 9702, desc: '',         size: '40-42', color: 'Black' },
  ],
});
await insertSlip({
  no: 'SL-1044', clientName: 'Bilal Shoe Mart', date: '2026-06-25', time: '10:10 AM', total: 10050,
  items: [{ name: 'Crepe Sole', qty: 15, price: 670, subtotal: 10050, discountType: null, discountAmount: 0, discountPct: 0, amount: 10050, desc: '', size: '41-43', color: 'Natural' }],
});
await insertSlip({
  no: 'SL-1045', clientName: 'Khan Shoe House', date: '2026-06-28', time: '04:30 PM', total: 13760,
  items: [{ name: 'TPR Sole', qty: 28, price: 520, subtotal: 14560, discountType: 'Rs', discountAmount: 800, discountPct: 0, amount: 13760, desc: 'Seasonal order', size: '41-43', color: 'Black' }],
});
await insertSlip({
  no: 'SL-1046', clientName: 'Raza Brothers', date: '2026-06-29', time: '01:00 PM', total: 24390,
  items: [
    { name: 'Rubber Sole', qty: 45, price: 380, subtotal: 17100, discountType: '%',  discountAmount: 1710, discountPct: 10, amount: 15390, desc: '', size: '40-42', color: 'Brown' },
    { name: 'PVC Sole',    qty: 20, price: 450, subtotal: 9000,  discountType: null, discountAmount: 0,    discountPct: 0,  amount: 9000,  desc: '', size: '42-44', color: 'Black' },
  ],
});

// ─── productions ────────────────────────────────────────────────────────────
async function insertProduction(date, entries) {
  const prodResult = await pool.request()
    .input('date', sql.Date, date)
    .query('INSERT INTO dbo.Productions (Date) OUTPUT INSERTED.Id VALUES (@date)');
  const productionId = prodResult.recordset[0].Id;
  for (const e of entries) {
    await pool.request()
      .input('productionId', sql.Int, productionId)
      .input('articleId', sql.Int, byName[e.articleName])
      .input('articleName', sql.NVarChar(255), e.articleName)
      .input('qty', sql.Int, e.qty)
      .query('INSERT INTO dbo.ProductionEntries (ProductionId, ArticleId, ArticleName, Qty) VALUES (@productionId, @articleId, @articleName, @qty)');
  }
}
await insertProduction('2026-06-23', [{ articleName: 'PVC Sole', qty: 30 }, { articleName: 'Rubber Sole', qty: 20 }, { articleName: 'TPR Sole', qty: 15 }]);
await insertProduction('2026-06-24', [{ articleName: 'Leather Sole', qty: 10 }, { articleName: 'Crepe Sole', qty: 12 }, { articleName: 'PU Sole', qty: 25 }]);
await insertProduction('2026-06-25', [{ articleName: 'PVC Sole', qty: 40 }, { articleName: 'EVA Foam Sole', qty: 50 }]);
await insertProduction('2026-06-26', [{ articleName: 'Rubber Sole', qty: 35 }, { articleName: 'TPR Sole', qty: 22 }, { articleName: 'PU Sole', qty: 18 }]);
await insertProduction('2026-06-27', [{ articleName: 'Leather Sole', qty: 8 }, { articleName: 'Crepe Sole', qty: 15 }]);
await insertProduction('2026-06-28', [{ articleName: 'PVC Sole', qty: 25 }, { articleName: 'Rubber Sole', qty: 30 }]);
await insertProduction('2026-06-29', [{ articleName: 'TPR Sole', qty: 28 }, { articleName: 'PU Sole', qty: 20 }]);

// ─── expenses ───────────────────────────────────────────────────────────────
async function insertExpense(date, time, rows) {
  const expResult = await pool.request()
    .input('date', sql.Date, date)
    .input('time', sql.NVarChar(20), time)
    .query('INSERT INTO dbo.Expenses (Date, Time) OUTPUT INSERTED.Id VALUES (@date, @time)');
  const expenseId = expResult.recordset[0].Id;
  for (const r of rows) {
    await pool.request()
      .input('expenseId', sql.Int, expenseId)
      .input('description', sql.NVarChar(500), r.desc)
      .input('price', sql.Decimal(10, 2), r.price)
      .query('INSERT INTO dbo.ExpenseRows (ExpenseId, Description, Price) VALUES (@expenseId, @description, @price)');
  }
}
await insertExpense('2026-06-01', '09:00 AM', [{ desc: 'Shop Rent', price: 25000 }, { desc: 'Labour Wages', price: 18000 }]);
await insertExpense('2026-06-05', '10:30 AM', [{ desc: 'Machine Maintenance', price: 5000 }, { desc: 'Packaging Material', price: 3500 }]);
await insertExpense('2026-06-10', '02:00 PM', [{ desc: 'Transportation', price: 4200 }, { desc: 'Office Supplies', price: 1800 }]);
await insertExpense('2026-06-15', '11:00 AM', [{ desc: 'Security Services', price: 8000 }, { desc: 'Cleaning Services', price: 2500 }]);
await insertExpense('2026-06-20', '03:30 PM', [{ desc: 'Tool Replacement', price: 6500 }, { desc: 'Miscellaneous', price: 1200 }]);

// ─── bills ──────────────────────────────────────────────────────────────────
async function insertBill(date, month, entries) {
  const billResult = await pool.request()
    .input('date', sql.Date, date)
    .input('month', sql.NVarChar(50), month)
    .query('INSERT INTO dbo.Bills (Date, Month) OUTPUT INSERTED.Id VALUES (@date, @month)');
  const billId = billResult.recordset[0].Id;
  for (const e of entries) {
    await pool.request()
      .input('billId', sql.Int, billId)
      .input('name', sql.NVarChar(255), e.name)
      .input('amount', sql.Decimal(10, 2), e.amount)
      .query('INSERT INTO dbo.BillEntries (BillId, Name, Amount) VALUES (@billId, @name, @amount)');
  }
}
await insertBill('2026-05-01', 'May 2026',  [{ name: 'Electricity', amount: 12500 }, { name: 'Gas', amount: 3800 }]);
await insertBill('2026-06-01', 'June 2026', [{ name: 'Electricity', amount: 15200 }, { name: 'Gas', amount: 4200 }, { name: 'Water', amount: 1800 }]);
await insertBill('2026-06-05', 'June 2026', [{ name: 'Internet', amount: 2500 }]);
await insertBill('2026-06-10', 'June 2026', [{ name: 'Shop Rent', amount: 45000 }]);
await insertBill('2026-06-15', 'June 2026', [{ name: 'Electricity (AC)', amount: 3200 }]);

// ─── chemical purchases & usage ─────────────────────────────────────────────
for (const cp of [{ date: '2026-06-01', qty: 50, cost: 45000 }, { date: '2026-06-15', qty: 30, cost: 28000 }]) {
  await pool.request()
    .input('date', sql.Date, cp.date)
    .input('qty', sql.Decimal(10, 2), cp.qty)
    .input('cost', sql.Decimal(10, 2), cp.cost)
    .query('INSERT INTO dbo.ChemPurchases (Date, Qty, Cost) VALUES (@date, @qty, @cost)');
}
for (const cu of [
  { date: '2026-06-23', qty: 5 }, { date: '2026-06-24', qty: 4 }, { date: '2026-06-25', qty: 6 },
  { date: '2026-06-26', qty: 3 }, { date: '2026-06-27', qty: 5 }, { date: '2026-06-28', qty: 4 }, { date: '2026-06-29', qty: 3 },
]) {
  await pool.request()
    .input('date', sql.Date, cu.date)
    .input('qty', sql.Decimal(10, 2), cu.qty)
    .query('INSERT INTO dbo.ChemUsages (Date, Qty) VALUES (@date, @qty)');
}

console.log('Seed complete ✓');
await pool.close();
