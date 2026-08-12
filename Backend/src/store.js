/**
 * In-memory data store — placeholder until a real database is wired in.
 * Every collection is a plain JS array. Replace the exports here with
 * your DB models (Mongoose, Prisma, etc.) and the route handlers won't
 * need to change.
 */

import bcrypt from 'bcryptjs';

// ─── seed data (mirrors the frontend demo data) ──────────────────────────────

export const db = {
  settings: {
    username: 'admin',
    // bcrypt hash of 'admin'
    passwordHash: bcrypt.hashSync('admin', 10),
  },

  articles: [
    { id: 'a2', name: 'Rubber Sole',   price: 380, stock: 80,  color: 'Brown',   size: '9-10'   },
    { id: 'a3', name: 'TPR Sole',      price: 520, stock: 200, color: 'White',   size: '6-7'    },
    { id: 'a4', name: 'Leather Sole',  price: 850, stock: 45,  color: 'Tan',     size: '8-9'    },
    { id: 'a5', name: 'EVA Foam Sole', price: 290, stock: 15,  color: 'Grey',    size: 'Unisex' },
    { id: 'a6', name: 'Crepe Sole',    price: 670, stock: 60,  color: 'Natural', size: '8-9'    },
    { id: 'a7', name: 'PU Sole',       price: 490, stock: 90,  color: 'Black',   size: '10-11'  },
  ],

  clients: [
    { id: 'c1', name: 'Ahmed Footwear', phone: '0300-1234567' },
    { id: 'c2', name: 'Khan Shoe House', phone: '0312-9876543' },
    { id: 'c3', name: 'Malik Traders',   phone: '0333-4567890' },
    { id: 'c4', name: 'Bilal Shoe Mart', phone: '0301-7890123' },
    { id: 'c5', name: 'Raza Brothers',   phone: '0321-3456789' },
  ],

  slips: [
    {
      id: 'sl1035', no: 'SL-1035', clientId: 'c1', date: '2026-06-01', time: '10:30 AM', total: 14130,
      items: [
        { name: 'PVC Sole',    qty: 20, price: 450, subtotal: 9000,  discountType: null,  discountAmount: 0,   discountPct: 0,  amount: 9000,  desc: '',              size: '42-44', color: 'Black' },
        { name: 'Rubber Sole', qty: 15, price: 380, subtotal: 5700,  discountType: '%',   discountAmount: 570, discountPct: 10, amount: 5130,  desc: 'Regular order', size: '40-42', color: 'Brown' },
      ],
    },
    {
      id: 'sl1036', no: 'SL-1036', clientId: 'c2', date: '2026-06-03', time: '11:45 AM', total: 15000,
      items: [
        { name: 'TPR Sole', qty: 30, price: 520, subtotal: 15600, discountType: 'Rs', discountAmount: 600, discountPct: 0, amount: 15000, desc: '', size: '41-43', color: 'Black' },
      ],
    },
    {
      id: 'sl1037', no: 'SL-1037', clientId: 'c3', date: '2026-06-05', time: '01:20 PM', total: 18625,
      items: [
        { name: 'Leather Sole', qty: 10, price: 850, subtotal: 8500,  discountType: null, discountAmount: 0,    discountPct: 0,  amount: 8500,  desc: 'Premium quality', size: '42-44', color: 'Tan'   },
        { name: 'PVC Sole',     qty: 25, price: 450, subtotal: 11250, discountType: '%',  discountAmount: 1125, discountPct: 10, amount: 10125, desc: '',               size: '42-44', color: 'Black' },
      ],
    },
    {
      id: 'sl1038', no: 'SL-1038', clientId: 'c4', date: '2026-06-08', time: '12:00 PM', total: 8820,
      items: [
        { name: 'PU Sole', qty: 18, price: 490, subtotal: 8820, discountType: null, discountAmount: 0, discountPct: 0, amount: 8820, desc: '', size: '40-42', color: 'Black' },
      ],
    },
    {
      id: 'sl1039', no: 'SL-1039', clientId: 'c5', date: '2026-06-10', time: '05:00 PM', total: 7540,
      items: [
        { name: 'Crepe Sole', qty: 12, price: 670, subtotal: 8040, discountType: 'Rs', discountAmount: 500, discountPct: 0, amount: 7540, desc: 'Export quality', size: '41-43', color: 'Natural' },
      ],
    },
    {
      id: 'sl1040', no: 'SL-1040', clientId: 'c1', date: '2026-06-15', time: '02:15 PM', total: 24080,
      items: [
        { name: 'Rubber Sole', qty: 40, price: 380, subtotal: 15200, discountType: '%',  discountAmount: 1520, discountPct: 10, amount: 13680, desc: 'Bulk order', size: '40-42', color: 'Brown' },
        { name: 'TPR Sole',    qty: 20, price: 520, subtotal: 10400, discountType: null, discountAmount: 0,    discountPct: 0,  amount: 10400, desc: '',           size: '41-43', color: 'Black' },
      ],
    },
    {
      id: 'sl1041', no: 'SL-1041', clientId: 'c5', date: '2026-06-20', time: '11:30 AM', total: 13500,
      items: [
        { name: 'EVA Foam Sole', qty: 50, price: 290, subtotal: 14500, discountType: 'Rs', discountAmount: 1000, discountPct: 0, amount: 13500, desc: '', size: '38-40', color: 'White' },
      ],
    },
    {
      id: 'sl1042', no: 'SL-1042', clientId: 'c2', date: '2026-06-18', time: '09:00 AM', total: 14175,
      items: [
        { name: 'PVC Sole', qty: 35, price: 450, subtotal: 15750, discountType: '%', discountAmount: 1575, discountPct: 10, amount: 14175, desc: 'Regular supply', size: '42-44', color: 'Black' },
      ],
    },
    {
      id: 'sl1043', no: 'SL-1043', clientId: 'c3', date: '2026-06-22', time: '03:45 PM', total: 16502,
      items: [
        { name: 'Leather Sole', qty: 8,  price: 850, subtotal: 6800,  discountType: null, discountAmount: 0,    discountPct: 0,  amount: 6800, desc: 'Handmade', size: '42-44', color: 'Tan'   },
        { name: 'PU Sole',      qty: 22, price: 490, subtotal: 10780, discountType: '%',  discountAmount: 1078, discountPct: 10, amount: 9702, desc: '',         size: '40-42', color: 'Black' },
      ],
    },
    {
      id: 'sl1044', no: 'SL-1044', clientId: 'c4', date: '2026-06-25', time: '10:10 AM', total: 10050,
      items: [
        { name: 'Crepe Sole', qty: 15, price: 670, subtotal: 10050, discountType: null, discountAmount: 0, discountPct: 0, amount: 10050, desc: '', size: '41-43', color: 'Natural' },
      ],
    },
    {
      id: 'sl1045', no: 'SL-1045', clientId: 'c2', date: '2026-06-28', time: '04:30 PM', total: 13760,
      items: [
        { name: 'TPR Sole', qty: 28, price: 520, subtotal: 14560, discountType: 'Rs', discountAmount: 800, discountPct: 0, amount: 13760, desc: 'Seasonal order', size: '41-43', color: 'Black' },
      ],
    },
    {
      id: 'sl1046', no: 'SL-1046', clientId: 'c5', date: '2026-06-29', time: '01:00 PM', total: 24390,
      items: [
        { name: 'Rubber Sole', qty: 45, price: 380, subtotal: 17100, discountType: '%',  discountAmount: 1710, discountPct: 10, amount: 15390, desc: '',  size: '40-42', color: 'Brown' },
        { name: 'PVC Sole',    qty: 20, price: 450, subtotal: 9000,  discountType: null, discountAmount: 0,    discountPct: 0,  amount: 9000,  desc: '',  size: '42-44', color: 'Black' },
      ],
    },
  ],

  productions: [
    { id: 'p1', date: '2026-06-23', entries: [{ articleId: 'a1', articleName: 'PVC Sole', qty: 30 }, { articleId: 'a2', articleName: 'Rubber Sole', qty: 20 }, { articleId: 'a3', articleName: 'TPR Sole', qty: 15 }] },
    { id: 'p2', date: '2026-06-24', entries: [{ articleId: 'a4', articleName: 'Leather Sole', qty: 10 }, { articleId: 'a6', articleName: 'Crepe Sole', qty: 12 }, { articleId: 'a7', articleName: 'PU Sole', qty: 25 }] },
    { id: 'p3', date: '2026-06-25', entries: [{ articleId: 'a1', articleName: 'PVC Sole', qty: 40 }, { articleId: 'a5', articleName: 'EVA Foam Sole', qty: 50 }] },
    { id: 'p4', date: '2026-06-26', entries: [{ articleId: 'a2', articleName: 'Rubber Sole', qty: 35 }, { articleId: 'a3', articleName: 'TPR Sole', qty: 22 }, { articleId: 'a7', articleName: 'PU Sole', qty: 18 }] },
    { id: 'p5', date: '2026-06-27', entries: [{ articleId: 'a4', articleName: 'Leather Sole', qty: 8 }, { articleId: 'a6', articleName: 'Crepe Sole', qty: 15 }] },
    { id: 'p6', date: '2026-06-28', entries: [{ articleId: 'a1', articleName: 'PVC Sole', qty: 25 }, { articleId: 'a2', articleName: 'Rubber Sole', qty: 30 }] },
    { id: 'p7', date: '2026-06-29', entries: [{ articleId: 'a3', articleName: 'TPR Sole', qty: 28 }, { articleId: 'a7', articleName: 'PU Sole', qty: 20 }] },
  ],

  expenses: [
    { id: 'e1', date: '2026-06-01', time: '09:00 AM', rows: [{ desc: 'Shop Rent', price: 25000 }, { desc: 'Labour Wages', price: 18000 }] },
    { id: 'e2', date: '2026-06-05', time: '10:30 AM', rows: [{ desc: 'Machine Maintenance', price: 5000 }, { desc: 'Packaging Material', price: 3500 }] },
    { id: 'e3', date: '2026-06-10', time: '02:00 PM', rows: [{ desc: 'Transportation', price: 4200 }, { desc: 'Office Supplies', price: 1800 }] },
    { id: 'e4', date: '2026-06-15', time: '11:00 AM', rows: [{ desc: 'Security Services', price: 8000 }, { desc: 'Cleaning Services', price: 2500 }] },
    { id: 'e5', date: '2026-06-20', time: '03:30 PM', rows: [{ desc: 'Tool Replacement', price: 6500 }, { desc: 'Miscellaneous', price: 1200 }] },
  ],

  bills: [
    { id: 'b1', date: '2026-05-01', month: 'May 2026',  entries: [{ name: 'Electricity', amount: 12500 }, { name: 'Gas', amount: 3800 }] },
    { id: 'b2', date: '2026-06-01', month: 'June 2026', entries: [{ name: 'Electricity', amount: 15200 }, { name: 'Gas', amount: 4200 }, { name: 'Water', amount: 1800 }] },
    { id: 'b3', date: '2026-06-05', month: 'June 2026', entries: [{ name: 'Internet', amount: 2500 }] },
    { id: 'b4', date: '2026-06-10', month: 'June 2026', entries: [{ name: 'Shop Rent', amount: 45000 }] },
    { id: 'b5', date: '2026-06-15', month: 'June 2026', entries: [{ name: 'Electricity (AC)', amount: 3200 }] },
  ],

  chemPurchases: [
    { id: 'cp1', date: '2026-06-01', qty: 50, cost: 45000 },
    { id: 'cp2', date: '2026-06-15', qty: 30, cost: 28000 },
  ],

  chemUsage: [
    { id: 'cu1', date: '2026-06-23', qty: 5 },
    { id: 'cu2', date: '2026-06-24', qty: 4 },
    { id: 'cu3', date: '2026-06-25', qty: 6 },
    { id: 'cu4', date: '2026-06-26', qty: 3 },
    { id: 'cu5', date: '2026-06-27', qty: 5 },
    { id: 'cu6', date: '2026-06-28', qty: 4 },
    { id: 'cu7', date: '2026-06-29', qty: 3 },
  ],

  payments: [],
};
