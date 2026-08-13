# Windows Installer Verification Checklist

> Closes out `TASKS.md` Task 16's Windows-testing caveat. Run this on a real, clean
> Windows 10/11 machine or VM — a fresh snapshot with no SQL Server Express and no
> Node.js/npm preinstalled (only needed transiently to *build* the installer in
> step 1; end users never need Node). Neither Docker (Windows containers need a
> Windows host kernel — architecturally impossible on the Linux dev sandbox this
> project has used so far) nor a local QEMU VM (insufficient free disk/RAM, and
> Microsoft's ISO download endpoint returned `403` to that host) were viable there.
> See `DECISIONS.md`'s "Windows verification: Docker/local VM ruled out" entry for
> the full reasoning.

**Known blocker before you start — read this first:** a genuinely fresh install
(empty `Settings` table) currently has **no way to log in at all** — see
`TASKS.md` Task 19. Every login smoke test so far in this project's history
worked only because `seed.js` had already inserted a `Settings` row directly via
SQL. Until Task 19 is fixed, step 5 below will fail at the login checkbox no
matter what Windows does correctly. Either wait for Task 19 to land first, or —
purely to keep testing everything *except* login — manually insert a `Settings`
row via `sqlcmd` after step 4 (bcrypt-hash a test password first; don't invent a
shortcut that bypasses the real hash path, or step 5's login test proves nothing).

---

## 0. Prerequisites on the Windows machine

- Windows 10 or 11, clean snapshot — record the exact build (`winver`)
- No pre-existing SQL Server instance (`Get-Service | Where-Object {$_.Name -like '*SQL*'}` should return nothing; if it returns something, note it so you can tell "pre-existing" apart from "installer created this")
- Node.js LTS + npm + Git (build-time only, see above)

## 1. Build the real Windows installer

```
git clone <repo-url> && cd Starmans-desktop
cd Desktop_app/frontend/app && npm install && npm run build   # produces frontend/app/dist
cd ../../Backend && npm install --omit=dev
cd ../.. && npm install
npm run dist
```

- Confirm this produces a real NSIS installer at `Desktop_app/release/*.exe` — **not**
  the Linux `--dir` unpacked build that's already been tested (see `TASKS.md` Task 16).
- Record: installer filename, file size, and any `electron-builder` warnings/errors.
- **Why build on Windows instead of cross-compiling here via Wine:** this sandbox
  has `wine` installed and `electron-builder` can technically cross-build Windows
  NSIS installers from Linux with it, but a Wine-built artifact isn't guaranteed
  identical to a natively-built one (icon/resource embedding via `rcedit.exe`,
  NSIS compiler behavior). The entire point of this checklist is closing the
  Windows-verification gap for real — building on Windows too closes it
  completely instead of partially.

## 2. Install on a clean snapshot

Take a fresh VM snapshot (or a machine you can wipe after), then:

- [ ] Run the `.exe` from step 1
- [ ] NSIS wizard behaves per `Desktop_app/package.json`'s `nsis` config: shows
      an install-directory picker (`oneClick: false`) and creates a desktop
      shortcut (`createDesktopShortcut: true`)
- [ ] **Do not** manually install SQL Server first — the point is testing the
      automated path in step 3

## 3. First launch — SQL Server Express auto-install (`ensureSqlServer.js`)

Reference: `Desktop_app/scripts/ensureSqlServer.js`'s header comment has the
Microsoft fwlink URL it downloads from (`https://go.microsoft.com/fwlink/?linkid=2216019`
as of this writing — **check the live file**, fwlink targets can be repointed by
Microsoft independent of this repo). Launch the app from the desktop shortcut:

- [ ] The fwlink URL resolves to a real SQL Server Express bootstrapper (not a
      404 or a redirect to an unrelated page) — if this fails, that's the #1 risk
      `DECISIONS.md` already flagged; needs an updated URL, not a code fix
- [ ] The silent install (`/QUIET /ACTION=Install ...`) completes — verify via
      installed-programs list and `Get-Service 'MSSQL$SQLEXPRESS'`
- [ ] A generated `sa` password was persisted to the real Windows `userData` path.
      Per `main.js`, this is `app.getPath('userData')\mssql.env` — **empirically
      confirm the exact resolved path** (expected `%APPDATA%\starmans-desktop\mssql.env`,
      using `package.json`'s `"name"` field per Electron convention, matching what
      Task 16 confirmed on Linux at `~/.config/starmans-desktop/` — but this has
      never been checked on Windows itself). Confirm the file contains a plausible
      generated password, not a placeholder.
- [ ] If any of the above fails, confirm the app fails *safely* — a
      `dialog.showErrorBox` with a clear message, not a silent crash/hang

## 4. First launch — schema provisioning (`provisionDatabase.js`)

- [ ] App connects to the fresh instance's `master` DB, detects `starmans`
      doesn't exist, and runs `Backend/migrations/001_initial_schema.sql`
      (batch-split on `GO`) to create it
- [ ] All 14 tables exist afterward — cross-check table names/count against the
      migration file (`sqlcmd -S localhost\SQLEXPRESS -d starmans -Q "SELECT name FROM sys.tables"`, or SSMS)
- [ ] App proceeds to open its main window (login screen visible)

## 5. Full functional smoke test

Same depth as the Linux CDP-driven test already done for `TASKS.md` Task 17 — not
just "it didn't crash."

- [ ] **Login** — see the blocker note at the top of this file
- [ ] **Create/confirm an article**, note its stock quantity
- [ ] **Create a slip** against it — confirm stock decreases by the exact
      quantity (record before/after numbers)
- [ ] **Edit the slip's quantity** — confirm the delta is applied correctly
      (exercises the fixed double-restore-on-edit bug, see `TASKS.md` Task 9)
- [ ] **Delete the slip** — confirm stock is restored to its exact pre-slip value
- [ ] **Profit aggregation** — cross-check the UI's displayed gross sales against
      a raw `SELECT SUM(Total) FROM Slips WHERE <same date filter>` via `sqlcmd`
- [ ] **Chemical usage over-limit rejection** — log usage exceeding remaining
      stock, confirm it's rejected with the correct message, not silently
      accepted or a crash

## 6. Report back

For each checkbox: pass/fail and exact error text if it failed. Then update:

- `TASKS.md` Task 16's entry — replace the "unverified" caveat with real
  Windows results
- `DECISIONS.md`'s "SQL Server Express auto-install... unverified" entry —
  confirmed-working or the specific failure and what it needs

If anything fails, log it as a new numbered `TASKS.md` task rather than patching
`ensureSqlServer.js` blind — nobody without Windows access can iterate against
it, so a failure report needs the exact error and exact step for whoever picks
it up next (on or off Windows) to reason about without re-running everything.
