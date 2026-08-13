// Fetches the SQL Server Express installer at CI BUILD time (not on the
// client's machine at install time) so it can be bundled into the
// installer via electron-builder's `extraResources`. See DECISIONS.md,
// "REVISED: adopt a proven bundled-SQL-Server release pipeline" — this
// replaces the old install-time-download approach in ensureSqlServer.js.
//
// URL VERIFIED 2026-08-13: confirmed via a direct HTTP HEAD request to
// return 200 OK, Content-Type: application/octet-stream, Content-Length:
// 748772024 bytes (~714MB) — the real offline "Core" SQL Server Express
// package, not the small web-bootstrapper (the fwlink previously here,
// go.microsoft.com/fwlink/?linkid=2216019, was tried first and confirmed
// WRONG — it resolves to SQL2025-SSEI-Expr.exe, a ~4.4MB web installer that
// needs internet at install time, exactly what this build-time-download
// approach exists to avoid). Fwlink targets can still be repointed by
// Microsoft independent of this repo — re-verify with the same curl -IL
// check if this ever starts failing.
//
// Idempotent: skips re-downloading if a sane file is already present.
// Deletes anything suspiciously small as a truncated/failed download
// rather than silently bundling a broken installer.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const SQL_EXPRESS_URL = 'https://download.microsoft.com/download/dea8c210-c44a-4a9d-9d80-0c81578860c5/ENU/SQLEXPR_x64_ENU.exe';
const OUT_DIR = path.join(__dirname, '..', 'build', 'sqlserver');
const OUT_FILE = path.join(OUT_DIR, 'SQLEXPR_x64_ENU.exe');
const MIN_SANE_BYTES = 600 * 1024 * 1024; // 600MB — real package is ~714MB; anything smaller is truncated/wrong

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
      `Downloaded file is only ${(size / 1024 / 1024).toFixed(1)}MB, expected ~714MB — ` +
      `deleted as truncated/wrong. The fwlink URL may have changed; verify it manually.`
    );
  }
  console.log(`Downloaded ${(size / 1024 / 1024).toFixed(1)}MB to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
