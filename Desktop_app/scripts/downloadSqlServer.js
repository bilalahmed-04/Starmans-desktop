// Fetches the SQL Server Express installer at CI BUILD time (not on the
// client's machine at install time) so it can be bundled into the
// installer via electron-builder's `extraResources`. See DECISIONS.md,
// "REVISED: adopt a proven bundled-SQL-Server release pipeline" — this
// replaces the old install-time-download approach in ensureSqlServer.js.
//
// *** URL UNVERIFIED — same caveat as the superseded ensureSqlServer.js:
// Microsoft's fwlink targets change over time and this project's dev
// environment has never been able to actually run this download+bundle+
// install cycle on Windows. Confirm this resolves to a real, current
// SQL Server Express "Basic" package installer (the ~266MB standalone
// package, not the small web-bootstrapper variant — those are different
// downloads from Microsoft) before relying on it in a release build. ***
//
// Idempotent: skips re-downloading if a sane file is already present.
// Deletes anything suspiciously small as a truncated/failed download
// rather than silently bundling a broken installer.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const SQL_EXPRESS_URL = 'https://go.microsoft.com/fwlink/?linkid=2216019';
const OUT_DIR = path.join(__dirname, '..', 'build', 'sqlserver');
const OUT_FILE = path.join(OUT_DIR, 'SQLEXPR_x64_ENU.exe');
const MIN_SANE_BYTES = 200 * 1024 * 1024; // 200MB — anything smaller is a truncated/wrong download

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        download(response.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`SQL Server Express download failed: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (fs.existsSync(OUT_FILE)) {
    const { size } = fs.statSync(OUT_FILE);
    if (size >= MIN_SANE_BYTES) {
      console.log(`SQL Server Express installer already present (${(size / 1024 / 1024).toFixed(1)}MB) — skipping download.`);
      return;
    }
    console.warn(`Existing file is only ${(size / 1024 / 1024).toFixed(1)}MB — treating as truncated, re-downloading.`);
    fs.unlinkSync(OUT_FILE);
  }

  console.log(`Downloading SQL Server Express from ${SQL_EXPRESS_URL} ...`);
  await download(SQL_EXPRESS_URL, OUT_FILE);

  const { size } = fs.statSync(OUT_FILE);
  if (size < MIN_SANE_BYTES) {
    fs.unlinkSync(OUT_FILE);
    throw new Error(
      `Downloaded file is only ${(size / 1024 / 1024).toFixed(1)}MB, expected ~266MB — ` +
      `deleted as truncated/wrong. The fwlink URL may have changed; verify it manually.`
    );
  }
  console.log(`Downloaded ${(size / 1024 / 1024).toFixed(1)}MB to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
