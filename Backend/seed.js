/**
 * Seed the MongoDB database with demo data.
 * Run once: node seed.js
 * Re-running will wipe and re-seed all collections.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import Article     from './src/models/Article.js';
import Client      from './src/models/Client.js';
import Slip        from './src/models/Slip.js';
import Production  from './src/models/Production.js';
import Expense     from './src/models/Expense.js';
import Bill        from './src/models/Bill.js';
import ChemPurchase from './src/models/ChemPurchase.js';
import ChemUsage   from './src/models/ChemUsage.js';
import Payment     from './src/models/Payment.js';
import Settings    from './src/models/Settings.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/starmans';
await mongoose.connect(URI);
console.log('Connected to MongoDB');

// ─── wipe ─────────────────────────────────────────────────────────────────────
await Promise.all([
  Article.deleteMany(), Client.deleteMany(), Slip.deleteMany(),
  Production.deleteMany(), Expense.deleteMany(), Bill.deleteMany(),
  ChemPurchase.deleteMany(), ChemUsage.deleteMany(), Payment.deleteMany(),
  Settings.deleteMany(),
]);
console.log('Collections cleared');

// ─── settings ─────────────────────────────────────────────────────────────────
await Settings.create({ username: 'admin', passwordHash: await bcrypt.hash('admin', 10) });

// ─── articles ─────────────────────────────────────────────────────────────────
const articles = await Article.insertMany([
  { name: 'Rubber Sole',   price: 380, stock: 80,  color: 'Brown',   size: '9-10'   },
  { name: 'TPR Sole',      price: 520, stock: 200, color: 'White',   size: '6-7'    },
  { name: 'Leather Sole',  price: 850, stock: 45,  color: 'Tan',     size: '8-9'    },
  { name: 'EVA Foam Sole', price: 290, stock: 15,  color: 'Grey',    size: 'Unisex' },
  { name: 'Crepe Sole',    price: 670, stock: 60,  color: 'Natural', size: '8-9'    },
  { name: 'PU Sole',       price: 490, stock: 90,  color: 'Black',   size: '10-11'  },
  { name: 'PVC Sole',      price: 450, stock: 120, color: 'Black',   size: '42-44'  },
]);
const byName = Object.fromEntries(articles.map(a => [a.name, a]));

// ─── clients ──────────────────────────────────────────────────────────────────
const clients = await Client.insertMany([
  { name: 'Ahmed Footwear', phone: '0300-1234567' },
  { name: 'Khan Shoe House', phone: '0312-9876543' },
  { name: 'Malik Traders',   phone: '0333-4567890' },
  { name: 'Bilal Shoe Mart', phone: '0301-7890123' },
  { name: 'Raza Brothers',   phone: '0321-3456789' },
]);
const byClient = Object.fromEntries(clients.map(c => [c.name, c]));

// ─── slips ────────────────────────────────────────────────────────────────────
await Slip.insertMany([
  {
    no: 'SL-1035', clientId: byClient['Ahmed Footwear']._id, date: '2026-06-01', time: '10:30 AM', total: 14130,
    items: [
      { name: 'PVC Sole',    qty: 20, price: 450, subtotal: 9000, discountType: null, discountAmount: 0,   discountPct: 0,  amount: 9000, desc: '',              size: '42-44', color: 'Black' },
      { name: 'Rubber Sole', qty: 15, price: 380, subtotal: 5700, discountType: '%',  discountAmount: 570, discountPct: 10, amount: 5130, desc: 'Regular order', size: '40-42', color: 'Brown' },
    ],
  },
  {
    no: 'SL-1036', clientId: byClient['Khan Shoe House']._id, date: '2026-06-03', time: '11:45 AM', total: 15000,
    items: [{ name: 'TPR Sole', qty: 30, price: 520, subtotal: 15600, discountType: 'Rs', discountAmount: 600, discountPct: 0, amount: 15000, desc: '', size: '41-43', color: 'Black' }],
  },
  {
    no: 'SL-1037', clientId: byClient['Malik Traders']._id, date: '2026-06-05', time: '01:20 PM', total: 18625,
    items: [
      { name: 'Leather Sole', qty: 10, price: 850, subtotal: 8500,  discountType: null, discountAmount: 0,    discountPct: 0,  amount: 8500,  desc: 'Premium quality', size: '42-44', color: 'Tan'   },
      { name: 'PVC Sole',     qty: 25, price: 450, subtotal: 11250, discountType: '%',  discountAmount: 1125, discountPct: 10, amount: 10125, desc: '',               size: '42-44', color: 'Black' },
    ],
  },
  {
    no: 'SL-1038', clientId: byClient['Bilal Shoe Mart']._id, date: '2026-06-08', time: '12:00 PM', total: 8820,
    items: [{ name: 'PU Sole', qty: 18, price: 490, subtotal: 8820, discountType: null, discountAmount: 0, discountPct: 0, amount: 8820, desc: '', size: '40-42', color: 'Black' }],
  },
  {
    no: 'SL-1039', clientId: byClient['Raza Brothers']._id, date: '2026-06-10', time: '05:00 PM', total: 7540,
    items: [{ name: 'Crepe Sole', qty: 12, price: 670, subtotal: 8040, discountType: 'Rs', discountAmount: 500, discountPct: 0, amount: 7540, desc: 'Export quality', size: '41-43', color: 'Natural' }],
  },
  {
    no: 'SL-1040', clientId: byClient['Ahmed Footwear']._id, date: '2026-06-15', time: '02:15 PM', total: 24080,
    items: [
      { name: 'Rubber Sole', qty: 40, price: 380, subtotal: 15200, discountType: '%',  discountAmount: 1520, discountPct: 10, amount: 13680, desc: 'Bulk order', size: '40-42', color: 'Brown' },
      { name: 'TPR Sole',    qty: 20, price: 520, subtotal: 10400, discountType: null, discountAmount: 0,    discountPct: 0,  amount: 10400, desc: '',           size: '41-43', color: 'Black' },
    ],
  },
  {
    no: 'SL-1041', clientId: byClient['Raza Brothers']._id, date: '2026-06-20', time: '11:30 AM', total: 13500,
    items: [{ name: 'EVA Foam Sole', qty: 50, price: 290, subtotal: 14500, discountType: 'Rs', discountAmount: 1000, discountPct: 0, amount: 13500, desc: '', size: '38-40', color: 'White' }],
  },
  {
    no: 'SL-1042', clientId: byClient['Khan Shoe House']._id, date: '2026-06-18', time: '09:00 AM', total: 14175,
    items: [{ name: 'PVC Sole', qty: 35, price: 450, subtotal: 15750, discountType: '%', discountAmount: 1575, discountPct: 10, amount: 14175, desc: 'Regular supply', size: '42-44', color: 'Black' }],
  },
  {
    no: 'SL-1043', clientId: byClient['Malik Traders']._id, date: '2026-06-22', time: '03:45 PM', total: 16502,
    items: [
      { name: 'Leather Sole', qty: 8,  price: 850, subtotal: 6800,  discountType: null, discountAmount: 0,    discountPct: 0,  amount: 6800, desc: 'Handmade', size: '42-44', color: 'Tan'   },
      { name: 'PU Sole',      qty: 22, price: 490, subtotal: 10780, discountType: '%',  discountAmount: 1078, discountPct: 10, amount: 9702, desc: '',         size: '40-42', color: 'Black' },
    ],
  },
  {
    no: 'SL-1044', clientId: byClient['Bilal Shoe Mart']._id, date: '2026-06-25', time: '10:10 AM', total: 10050,
    items: [{ name: 'Crepe Sole', qty: 15, price: 670, subtotal: 10050, discountType: null, discountAmount: 0, discountPct: 0, amount: 10050, desc: '', size: '41-43', color: 'Natural' }],
  },
  {
    no: 'SL-1045', clientId: byClient['Khan Shoe House']._id, date: '2026-06-28', time: '04:30 PM', total: 13760,
    items: [{ name: 'TPR Sole', qty: 28, price: 520, subtotal: 14560, discountType: 'Rs', discountAmount: 800, discountPct: 0, amount: 13760, desc: 'Seasonal order', size: '41-43', color: 'Black' }],
  },
  {
    no: 'SL-1046', clientId: byClient['Raza Brothers']._id, date: '2026-06-29', time: '01:00 PM', total: 24390,
    items: [
      { name: 'Rubber Sole', qty: 45, price: 380, subtotal: 17100, discountType: '%',  discountAmount: 1710, discountPct: 10, amount: 15390, desc: '', size: '40-42', color: 'Brown' },
      { name: 'PVC Sole',    qty: 20, price: 450, subtotal: 9000,  discountType: null, discountAmount: 0,    discountPct: 0,  amount: 9000,  desc: '', size: '42-44', color: 'Black' },
    ],
  },
]);

// ─── productions ──────────────────────────────────────────────────────────────
await Production.insertMany([
  { date: '2026-06-23', entries: [{ articleId: byName['PVC Sole']._id.toString(), articleName: 'PVC Sole', qty: 30 }, { articleId: byName['Rubber Sole']._id.toString(), articleName: 'Rubber Sole', qty: 20 }, { articleId: byName['TPR Sole']._id.toString(), articleName: 'TPR Sole', qty: 15 }] },
  { date: '2026-06-24', entries: [{ articleId: byName['Leather Sole']._id.toString(), articleName: 'Leather Sole', qty: 10 }, { articleId: byName['Crepe Sole']._id.toString(), articleName: 'Crepe Sole', qty: 12 }, { articleId: byName['PU Sole']._id.toString(), articleName: 'PU Sole', qty: 25 }] },
  { date: '2026-06-25', entries: [{ articleId: byName['PVC Sole']._id.toString(), articleName: 'PVC Sole', qty: 40 }, { articleId: byName['EVA Foam Sole']._id.toString(), articleName: 'EVA Foam Sole', qty: 50 }] },
  { date: '2026-06-26', entries: [{ articleId: byName['Rubber Sole']._id.toString(), articleName: 'Rubber Sole', qty: 35 }, { articleId: byName['TPR Sole']._id.toString(), articleName: 'TPR Sole', qty: 22 }, { articleId: byName['PU Sole']._id.toString(), articleName: 'PU Sole', qty: 18 }] },
  { date: '2026-06-27', entries: [{ articleId: byName['Leather Sole']._id.toString(), articleName: 'Leather Sole', qty: 8 }, { articleId: byName['Crepe Sole']._id.toString(), articleName: 'Crepe Sole', qty: 15 }] },
  { date: '2026-06-28', entries: [{ articleId: byName['PVC Sole']._id.toString(), articleName: 'PVC Sole', qty: 25 }, { articleId: byName['Rubber Sole']._id.toString(), articleName: 'Rubber Sole', qty: 30 }] },
  { date: '2026-06-29', entries: [{ articleId: byName['TPR Sole']._id.toString(), articleName: 'TPR Sole', qty: 28 }, { articleId: byName['PU Sole']._id.toString(), articleName: 'PU Sole', qty: 20 }] },
]);

// ─── expenses ─────────────────────────────────────────────────────────────────
await Expense.insertMany([
  { date: '2026-06-01', time: '09:00 AM', rows: [{ desc: 'Shop Rent', price: 25000 }, { desc: 'Labour Wages', price: 18000 }] },
  { date: '2026-06-05', time: '10:30 AM', rows: [{ desc: 'Machine Maintenance', price: 5000 }, { desc: 'Packaging Material', price: 3500 }] },
  { date: '2026-06-10', time: '02:00 PM', rows: [{ desc: 'Transportation', price: 4200 }, { desc: 'Office Supplies', price: 1800 }] },
  { date: '2026-06-15', time: '11:00 AM', rows: [{ desc: 'Security Services', price: 8000 }, { desc: 'Cleaning Services', price: 2500 }] },
  { date: '2026-06-20', time: '03:30 PM', rows: [{ desc: 'Tool Replacement', price: 6500 }, { desc: 'Miscellaneous', price: 1200 }] },
]);

// ─── bills ────────────────────────────────────────────────────────────────────
await Bill.insertMany([
  { date: '2026-05-01', month: 'May 2026',  entries: [{ name: 'Electricity', amount: 12500 }, { name: 'Gas', amount: 3800 }] },
  { date: '2026-06-01', month: 'June 2026', entries: [{ name: 'Electricity', amount: 15200 }, { name: 'Gas', amount: 4200 }, { name: 'Water', amount: 1800 }] },
  { date: '2026-06-05', month: 'June 2026', entries: [{ name: 'Internet', amount: 2500 }] },
  { date: '2026-06-10', month: 'June 2026', entries: [{ name: 'Shop Rent', amount: 45000 }] },
  { date: '2026-06-15', month: 'June 2026', entries: [{ name: 'Electricity (AC)', amount: 3200 }] },
]);

// ─── chemical purchases & usage ───────────────────────────────────────────────
await ChemPurchase.insertMany([
  { date: '2026-06-01', qty: 50, cost: 45000 },
  { date: '2026-06-15', qty: 30, cost: 28000 },
]);
await ChemUsage.insertMany([
  { date: '2026-06-23', qty: 5 },
  { date: '2026-06-24', qty: 4 },
  { date: '2026-06-25', qty: 6 },
  { date: '2026-06-26', qty: 3 },
  { date: '2026-06-27', qty: 5 },
  { date: '2026-06-28', qty: 4 },
  { date: '2026-06-29', qty: 3 },
]);

console.log('Seed complete ✓');
await mongoose.disconnect();
