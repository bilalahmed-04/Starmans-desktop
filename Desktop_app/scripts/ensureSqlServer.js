// Best-effort SQL Server Express silent install for first-run provisioning
// (per DECISIONS.md: "SQL Server installed via internet download during
// setup, not bundled offline").
//
// *** UNVERIFIED — written against Microsoft's documented command-line
// setup parameters (learn.microsoft.com/sql/database-engine/install-windows/
// install-sql-server-from-the-command-prompt), but this project's dev
// environment is Linux-only (see DECISIONS.md's "Development environment"
// entry), so the actual bootstrapper download + silent install has never
// been run. MUST be tested on a real Windows machine before this ships in
// a client-facing installer — the download URL (Microsoft's fwlink targets
// change over time) and the exact flag set are both real risk areas. ***
//
// Designed to fail safe: if the automated install doesn't work, the caller
// falls back to a dialog with manual instructions (see main.js) rather than
// a silent, confusing crash.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const https = require('node:https');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');

const SQL_EXPRESS_BOOTSTRAP_URL = 'https://go.microsoft.com/fwlink/?linkid=2216019';
const INSTANCE_NAME = 'SQLEXPRESS';

async function isMssqlReachable(sql, config) {
  try {
    const pool = await sql.connect({ ...config, database: 'master', connectionTimeout: 3000 });
    await pool.close();
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`SQL Server Express download failed: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', reject);
  });
}

// SQL Server password policy: 8+ chars incl. upper/lower/digit/symbol.
function generatePassword() {
  return crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, 'x') + 'Aa1!';
}

async function installSqlServerExpress(saPassword) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starmans-sql-'));
  const bootstrapPath = path.join(tmpDir, 'SQLEXPR_setup.exe');
  await downloadFile(SQL_EXPRESS_BOOTSTRAP_URL, bootstrapPath);

  await new Promise((resolve, reject) => {
    execFile(bootstrapPath, [
      '/ACTION=Install',
      '/IACCEPTSQLSERVERLICENSETERMS',
      '/QUIET',
      `/INSTANCENAME=${INSTANCE_NAME}`,
      '/SECURITYMODE=SQL',
      `/SAPWORD=${saPassword}`,
      '/SQLSYSADMINACCOUNTS=BUILTIN\\Administrators',
      '/TCPENABLED=1',
    ], { timeout: 20 * 60 * 1000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Returns the generated sa password if a fresh install happened, or null if
// MSSQL was already reachable (nothing to do) — caller persists the password
// (see main.js) since normal app startup needs it for every future launch.
async function ensureSqlServer({ sql, config }) {
  if (process.platform !== 'win32') return null; // dev-only on Linux; shipped app is Windows-only
  if (await isMssqlReachable(sql, config)) return null;

  const saPassword = generatePassword();
  await installSqlServerExpress(saPassword);
  return saPassword;
}

module.exports = { ensureSqlServer, isMssqlReachable, generatePassword };
