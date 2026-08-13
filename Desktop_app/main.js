const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

// Dev: Backend/.env (gitignored, developer's local MSSQL creds).
// Production: userData/mssql.env — written by ensureSqlServer.js after a
// fresh SQL Server Express install generates a new sa password (see that
// file's caveats). `override: true` lets a production file win if both
// somehow exist, which shouldn't normally happen.
require('dotenv').config({ path: path.join(__dirname, 'Backend', '.env') });
require('dotenv').config({ path: path.join(app.getPath('userData'), 'mssql.env'), override: true });

const BACKEND_SRC = path.join(__dirname, 'Backend', 'src');

// Backend/ is ESM ("type": "module" in Backend/package.json); this file is
// CommonJS (no "type" field in Desktop_app/package.json) — the traditional,
// least-friction choice for an Electron main process + preload script.
// Node's dynamic import() bridges CJS -> ESM cleanly, so Backend's services
// are imported this way rather than converting either side's module system.
function toFileUrl(p) {
  return require('node:url').pathToFileURL(p).href;
}

// { ok: true, data } / { ok: false, error: { message, code } } envelope —
// ipcMain.handle must never throw: Electron strips custom properties (like
// .code) off thrown errors crossing the IPC boundary, so this is the only
// reliable way to carry structured error info (phone_conflict, insufficient
// stock, etc.) back to the renderer. See DECISIONS.md's Group 5 entry.
function ok(data) {
  return { ok: true, data };
}

function fail(err) {
  return { ok: false, error: { message: err.message, code: err.code || 'internal_error' } };
}

function wrap(handler) {
  return async (_event, ...args) => {
    try {
      return ok(await handler(...args));
    } catch (err) {
      return fail(err);
    }
  };
}

// Mirrors mssqlDb.js's own config construction — needed here separately
// because first-run provisioning must connect to `master` (see
// scripts/provisionDatabase.js), not `starmans`, which may not exist yet.
function buildMssqlConfig(database) {
  return {
    server: process.env.MSSQL_SERVER || 'localhost',
    port: Number(process.env.MSSQL_PORT) || 1433,
    database,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    options: {
      encrypt: process.env.MSSQL_ENCRYPT !== 'false',
      trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERTIFICATE !== 'false',
    },
  };
}

function persistGeneratedPassword(saPassword) {
  const envPath = path.join(app.getPath('userData'), 'mssql.env');
  const contents = [
    'MSSQL_SERVER=localhost',
    'MSSQL_PORT=1433',
    'MSSQL_DATABASE=starmans',
    'MSSQL_USER=sa',
    `MSSQL_PASSWORD=${saPassword}`,
    'MSSQL_ENCRYPT=true',
    'MSSQL_TRUST_SERVER_CERTIFICATE=true',
  ].join('\n');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(envPath, contents, { mode: 0o600 });
  process.env.MSSQL_USER = 'sa';
  process.env.MSSQL_PASSWORD = saPassword;
}

async function registerIpcHandlers() {
  const { connectMSSQL, sql } = await import(toFileUrl(path.join(BACKEND_SRC, 'mssqlDb.js')));

  // Best-effort — see scripts/ensureSqlServer.js's caveats (unverified on a
  // real Windows machine). Falls through to provisionDatabase()/connectMSSQL()
  // either way; if SQL Server truly isn't reachable, those fail with a clear
  // error surfaced via the dialog in the app.whenReady().catch() below,
  // rather than this step silently swallowing the problem.
  try {
    const { ensureSqlServer } = require('./scripts/ensureSqlServer.js');
    const generatedPassword = await ensureSqlServer({ sql, config: buildMssqlConfig('master') });
    if (generatedPassword) persistGeneratedPassword(generatedPassword);
  } catch (err) {
    console.error('SQL Server Express auto-install failed (see scripts/ensureSqlServer.js):', err.message);
  }

  const { provisionDatabase } = require('./scripts/provisionDatabase.js');
  await provisionDatabase({
    sql,
    config: buildMssqlConfig('master'),
    migrationPath: path.join(BACKEND_SRC, '..', 'migrations', '001_initial_schema.sql'),
  });

  await connectMSSQL();

  const auth = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'auth.js')));
  const articles = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'articles.js')));
  const clients = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'clients.js')));
  const chemicals = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'chemicals.js')));
  const expenses = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'expenses.js')));
  const bills = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'bills.js')));
  const productions = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'productions.js')));
  const slips = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'slips.js')));
  const payments = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'payments.js')));
  const profit = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'profit.js')));

  // auth:* — no token issuance under IPC (see DECISIONS.md's Group 5 entry:
  // JWT has no network boundary to protect here, this is a same-process call).
  ipcMain.handle('auth:login', wrap((username, password) => auth.verifyCredentials(username, password)));
  ipcMain.handle('auth:updateSettings', wrap((payload) => auth.changeSettings(payload)));

  ipcMain.handle('articles:list', wrap((filter) => articles.listArticles(filter)));
  ipcMain.handle('articles:create', wrap((data) => articles.addArticle(data)));
  ipcMain.handle('articles:delete', wrap((id) => articles.removeArticle(Number(id))));

  ipcMain.handle('clients:list', wrap(() => clients.listClients()));
  ipcMain.handle('clients:get', wrap((id) => clients.getClient(Number(id))));
  ipcMain.handle('clients:create', wrap((data) => clients.addClient(data)));

  ipcMain.handle('chemicals:summary', wrap(() => chemicals.getSummary()));
  ipcMain.handle('chemicals:listPurchases', wrap((filter) => chemicals.listPurchases(filter)));
  ipcMain.handle('chemicals:createPurchase', wrap((data) => chemicals.addPurchase(data)));
  ipcMain.handle('chemicals:listUsages', wrap((filter) => chemicals.listUsages(filter)));
  ipcMain.handle('chemicals:createUsage', wrap((data) => chemicals.addUsage(data)));

  ipcMain.handle('expenses:list', wrap((filter) => expenses.listExpenses(filter)));
  ipcMain.handle('expenses:create', wrap((data) => expenses.addExpense(data)));

  ipcMain.handle('bills:list', wrap((filter) => bills.listBills(filter)));
  ipcMain.handle('bills:create', wrap((data) => bills.addBill(data)));

  ipcMain.handle('productions:list', wrap((filter) => productions.listProductions(filter)));
  ipcMain.handle('productions:create', wrap((data) => productions.addProduction(data)));

  ipcMain.handle('slips:list', wrap((filter) => slips.listSlips(filter)));
  ipcMain.handle('slips:create', wrap((data) => slips.addSlip(data)));
  ipcMain.handle('slips:get', wrap((id) => slips.getSlip(Number(id))));
  ipcMain.handle('slips:update', wrap((id, items) => slips.editSlip(Number(id), items)));
  ipcMain.handle('slips:delete', wrap((id) => slips.removeSlip(Number(id))));

  ipcMain.handle('payments:list', wrap((filter) => payments.listPayments(filter)));
  ipcMain.handle('payments:create', wrap((data) => payments.addPayment(data)));

  ipcMain.handle('profit:monthly', wrap((month) => profit.getMonthly(month)));
  ipcMain.handle('profit:annual', wrap((year) => profit.getAnnual(year)));
  ipcMain.handle('profit:analytics', wrap((month, year) => profit.getAnalytics(month, year)));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, 'frontend', 'app', 'dist', 'index.html'));
  }
}

app.whenReady()
  .then(async () => {
    await registerIpcHandlers();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((err) => {
    // A packaged app has no visible console — dialog.showErrorBox is the
    // only way a user (or the developer, over their shoulder) sees why
    // startup failed (most likely: SQL Server unreachable).
    console.error('Failed to start Starmans:', err);
    dialog.showErrorBox('Starmans failed to start', err.message || String(err));
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
