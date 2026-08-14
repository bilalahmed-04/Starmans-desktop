const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

// Dev: Backend/.env (gitignored, developer's local MSSQL creds).
// Production: %ProgramData%\Starmans\app-config.json — written by the NSIS
// installer's build/setup-sqlserver.ps1 during install/update (the user
// types the database password once, in the installer UI). This supersedes
// the old ensureSqlServer.js/userData-mssql.env approach (auto-generated
// password, installed at first app launch instead of install time) — see
// DECISIONS.md, "REVISED: adopt a proven bundled-SQL-Server release
// pipeline".
require('dotenv').config({ path: path.join(__dirname, 'Backend', '.env') });
loadProductionConfig();

function loadProductionConfig() {
  // %ProgramData% is a system env var, always set on Windows Vista+; no
  // NSIS-style "no built-in constant" issue here since this is plain
  // Node reading `process.env`, not NSIS. Falls through silently in dev
  // (no config file yet) — Backend/.env above already covers that case.
  const configPath = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Starmans', 'app-config.json');
  if (!fs.existsSync(configPath)) return;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  process.env.MSSQL_SERVER = config.mssqlServer;
  process.env.MSSQL_PORT = String(config.mssqlPort);
  process.env.MSSQL_DATABASE = config.mssqlDatabase;
  process.env.MSSQL_USER = config.mssqlUser;
  process.env.MSSQL_PASSWORD = config.mssqlPassword;
}

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

async function registerIpcHandlers() {
  const { connectMSSQL } = await import(toFileUrl(path.join(BACKEND_SRC, 'mssqlDb.js')));

  // SQL Server itself, the sa password, and the database are all already
  // provisioned by this point — by build/setup-sqlserver.ps1 during install,
  // not by this app at first launch (see loadProductionConfig() above and
  // DECISIONS.md's pipeline-adoption entry). This step is now purely the
  // schema/migration check (release_pipeline.md §6 Step 5's "startup
  // self-sufficiency" — idempotent, safe to run on every launch), not
  // SQL Server installation.
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
  const updates = await import(toFileUrl(path.join(BACKEND_SRC, 'services', 'updates.js')));

  // A fresh install has an empty Settings table and no UI path to create the
  // first account, so seed one here (idempotent — never touches an existing
  // row). Runs after connectMSSQL() because it needs the `starmans` pool, and
  // after provisionDatabase() because the table has to exist first.
  // See TASKS.md Task 19.
  await auth.ensureDefaultAdmin();

  // auth:* — no token issuance under IPC (see DECISIONS.md's Group 5 entry:
  // JWT has no network boundary to protect here, this is a same-process call).
  ipcMain.handle('auth:login', wrap((username, password) => auth.verifyCredentials(username, password)));
  ipcMain.handle('auth:updateSettings', wrap((payload) => auth.changeSettings(payload)));
  ipcMain.handle('auth:isUsingDefaultCredentials', wrap(() => auth.isUsingDefaultCredentials()));

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

  // updates:* — manual "Check for Updates" only, never automatic/silent.
  // See Backend/src/services/updates.js for the probe/guard/error-handling
  // rules this wraps.
  ipcMain.handle('updates:check', wrap(() => updates.checkForUpdate({ app, autoUpdater })));
  ipcMain.handle('updates:install', wrap(() => updates.installUpdate({ autoUpdater })));
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
