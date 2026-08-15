// Fetches the SQL Server Express installer at CI BUILD time (not on the
// client's machine at install time) so it can be bundled into the
// installer via electron-builder's `extraResources`. See DECISIONS.md,
// "REVISED: adopt a proven bundled-SQL-Server release pipeline" — this
// replaces the old install-time-download approach in ensureSqlServer.js.
//
// VERSION: SQL Server 2022 Express Core, not 2025. Switched 2026-08-16 —
// two reasons, both from the project owner directly (see DECISIONS.md):
// smaller download, and a "stable" release rather than the newest one.
// URL VERIFIED via a direct HTTP HEAD request: 200 OK, Content-Type:
// application/octet-stream, Content-Length: 279293816 bytes (~266MB) — this
// is also the exact size release_pipeline.md's reference pipeline reports
// for the same package ("~266 MB, almost entirely the bundled SQL Server
// Express"), so it's the right family of file, not a smaller/different
// variant that happens to match by coincidence.
//
// The 2025 package this replaces was 748772024 bytes (~714MB) for the SAME
// "Express Core" tier — the size difference is not LocalDB-vs-Core, it's
// genuinely version-to-version bloat (2025 bundles Azure Arc/AI-related
// components visible in its own install-summary output that 2022 does not).
// Unattended-install parameters (SAPWD, INSTANCENAME, SECURITYMODE,
// TCPENABLED, SQLSYSADMINACCOUNTS) are unchanged across this switch — they
// have been stable since SQL Server 2016 — so setup-sqlserver.ps1 needed no
// changes for this.
//
// Fwlink targets can be repointed by Microsoft independent of this repo —
// re-verify with the same curl -IL check if this ever starts failing.
//
// Idempotent: skips re-downloading if a sane file is already present.
// Deletes anything suspiciously small as a truncated/failed download
// rather than silently bundling a broken installer.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const SQL_EXPRESS_URL = 'https://download.microsoft.com/download/3/8/d/38de7036-2433-4207-8eae-06e247e17b25/SQLEXPR_x64_ENU.exe';
const OUT_DIR = path.join(__dirname, '..', 'build', 'sqlserver');
const OUT_FILE = path.join(OUT_DIR, 'SQLEXPR_x64_ENU.exe');
const MIN_SANE_BYTES = 250 * 1024 * 1024; // 250MB — real package is ~266MB; anything smaller is truncated/wrong

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
