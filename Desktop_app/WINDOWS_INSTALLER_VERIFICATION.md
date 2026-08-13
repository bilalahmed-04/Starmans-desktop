# Windows Installer Verification Checklist

> Closes out `TASKS.md` Task 26 — rewritten from scratch for the release pipeline
> adopted in `DECISIONS.md` ("REVISED: adopt a proven bundled-SQL-Server release
> pipeline"). The previous version of this file verified `ensureSqlServer.js`'s
> install-time-download approach, which no longer exists — SQL Server Express is
> now bundled into the installer at build time and configured via a custom NSIS
> page + `setup-sqlserver.ps1`, not downloaded/installed at first app launch.
>
> Run this on a real, clean Windows 10/11 machine or VM — a fresh snapshot with
> no SQL Server and no Node.js/npm preinstalled (only needed transiently to
> *build* the installer in step 1; end users never need Node). Neither Docker
> (Windows containers need a Windows host kernel) nor a local QEMU VM
> (insufficient free disk/RAM in this project's dev sandbox) were viable there —
> see `DECISIONS.md`'s "Windows verification: Docker/local VM ruled out" entry.

**Known blocker before you start — read this first:** a genuinely fresh install
(empty `Settings` table) currently has **no way to log in at all** — see
`TASKS.md` Task 19, still open. Every login smoke test so far in this project's
history worked only because `seed.js` had already inserted a `Settings` row
directly via SQL. Until Task 19 is fixed, step 6 below will fail at the login
checkbox no matter what Windows does correctly. Either wait for Task 19 to land
first, or — purely to keep testing everything *except* login — manually insert a
`Settings` row via `sqlcmd` after step 5 (bcrypt-hash a test password first;
don't invent a shortcut that bypasses the real hash path, or step 6's login test
proves nothing).

---

## 0. Prerequisites on the Windows machine

- Windows 10 or 11, clean snapshot — record the exact build (`winver`)
- No pre-existing SQL Server instance (`Get-Service | Where-Object {$_.Name -like '*SQL*'}` should return nothing; if it returns something, note it — this checklist's step 4 is specifically designed to also *repair* a machine like this, worth testing deliberately if you have one)
- Node.js LTS + npm + Git (build-time only; end users never need these)
- If testing the code-signing setup (Task 25): the two GitHub secrets (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`) must actually be set in the repo first — see `Desktop_app/build/certs/README.md`. If they're not set yet, the build below will be unsigned; note that explicitly in your report rather than assuming signing was tested

## 1. Build the real Windows installer

Locally (produces an unsigned build — use this to test steps 2–7 without needing the signing secrets configured):

```
git clone <repo-url> && cd Starmans-desktop/Desktop_app
npm install
cd frontend/app && npm install && cd ../..
cd Backend && npm install && cd ..
npm run dist:win
```

Or, once `release.yml`'s two GitHub secrets are configured, trigger a real signed release build per `release_pipeline.md` §5's procedure (bump version, tag, push) and download the published `.exe` from the GitHub Release instead — this is the only way to test the *signed* build and the auto-update flow (steps 7–8).

- Confirm this produces a real NSIS installer at `Desktop_app/release/*.exe` — **not** a Linux-built or Wine-cross-built artifact (deliberately not attempted in this project — see `DECISIONS.md`'s Docker/VM entry for why a Wine-built installer wasn't trusted as equivalent)
- Record: installer filename (expect `Starmans Sole House Setup <version>.exe`), file size (~363MB+, mostly the bundled SQL Server Express), and any `electron-builder`/NSIS warnings or errors
- If this is the first time `Desktop_app/build/installer.nsh` has ever actually been compiled, **this step alone is significant news either way** — everything about it was verified as carefully as possible without a compiler (cross-checked against electron-builder's real template source, two real bugs found and fixed that way — see `TASKS.md` Task 21), but no NSIS compiler was ever available to confirm it actually compiles. Report the exact error text if it doesn't.

## 2. Install on a clean snapshot

- [ ] Run the `.exe` from step 1
- [ ] Elevation (UAC) prompt appears — expected, `nsis.perMachine: true` requires it
- [ ] Wizard shows the standard NSIS pages, **plus one custom page** asking for a database password (twice) and a backup folder — this is the new page from Task 21, did not exist in the previous pipeline
- [ ] Try submitting the custom page with mismatched passwords, and with a password under 8 characters — both should show a clear error and refuse to proceed (client-side validation in `installer.nsh`)
- [ ] Complete the wizard with a real password you'll remember for later steps
- [ ] Fixed install location, no directory-picker page (`allowToChangeInstallationDirectory: false`)

## 3. First launch — bundled SQL Server install + configuration (`setup-sqlserver.ps1`)

This is the highest-risk, least-verified part of the whole project — genuinely never run outside static/source-level review (see `TASKS.md` Task 21's notes on what *was* checked).

- [ ] SQL Server Express actually gets installed (check installed-programs list, `Get-Service 'MSSQL$SQLEXPRESS'`)
- [ ] Mixed-mode auth and TCP/IP on port 1433 are both enabled afterward (`Get-ItemProperty` on the instance's `MSSQLServer` registry key for `LoginMode`; SQL Server Configuration Manager for TCP/IP)
- [ ] `sa` login is enabled with the password you typed in step 2 — test this directly, don't just trust the app: `sqlcmd -S 127.0.0.1,1433 -U sa -P <password> -Q "SELECT 1"`
- [ ] The `starmans` database exists
- [ ] `%ProgramData%\Starmans\app-config.json` exists and contains the right values (server/port/database/user/password/backup folder) — **confirm it's under `%ProgramData%`, not a per-user path** (`setup-sqlserver.ps1` writes here specifically so it's visible regardless of which Windows user runs the app later, unlike the old `userData`-based approach)
- [ ] A log file exists (`%TEMP%\sqlserver-setup.log` per the script) with a readable step-by-step record
- [ ] If anything above failed, confirm the installer surfaced a clear `MessageBox` naming the log file (`installer.nsh`'s `customInstall` failure handling), not a silent "installation complete" with a broken database underneath

### 3a. Repair scenario (do this on a second clean snapshot, or by deliberately breaking sa's password first)

- [ ] Disable the `sa` login or change its password directly via SSMS/`sqlcmd`, then re-run the installer (or a future version's installer) over the existing install
- [ ] The custom password page is **skipped** this time (the self-owned `HKLM\Software\Starmans\Installed` registry marker + `app-config.json` both present — see `TASKS.md` Task 21's notes on why this isn't electron-builder's own uninstall registry key)
- [ ] `setup-sqlserver.ps1` runs with no password argument, reads the existing config, and **successfully re-enables/repairs `sa`'s access via Windows Integrated auth** even though its password was broken — this is the specific "repair a broken machine" capability the whole Windows-Integrated-auth design in the script exists for

## 4. First launch — schema provisioning (`provisionDatabase.js`)

Unchanged from the previous pipeline — this part only deals with the `starmans` database's own tables, not SQL Server installation, and was already the most directly-testable part on Linux.

- [ ] App connects, detects `starmans`'s schema doesn't exist yet, runs `Backend/migrations/001_initial_schema.sql` (batch-split on `GO`)
- [ ] All 14 tables exist afterward (`sqlcmd -S 127.0.0.1,1433 -d starmans -U sa -P <password> -Q "SELECT name FROM sys.tables"`)
- [ ] App proceeds to open its main window (login screen visible)

## 5. Signing verification (only if the build in step 1 used the real signing secrets)

- [ ] Right-click the `.exe` → Properties → Digital Signatures tab shows a signature, OR `signtool verify /pa "Starmans Sole House Setup <version>.exe"` succeeds
- [ ] Note whether Windows SmartScreen still shows a warning on first run — expected with a self-signed cert (this reduces but doesn't eliminate SmartScreen friction; see `DECISIONS.md`'s code-signing entry for why a real purchased cert is the eventual fix, not a bug in this build)

## 6. Full functional smoke test

Same depth as the Linux CDP-driven test already done for `TASKS.md` Task 17 — not just "it didn't crash."

- [ ] **Login** — see the blocker note at the top of this file
- [ ] **Create/confirm an article**, note its stock quantity
- [ ] **Create a slip** against it — confirm stock decreases by the exact quantity (record before/after numbers)
- [ ] **Edit the slip's quantity** — confirm the delta is applied correctly (exercises the fixed double-restore-on-edit bug, see `TASKS.md` Task 9)
- [ ] **Delete the slip** — confirm stock is restored to its exact pre-slip value
- [ ] **Profit aggregation** — cross-check the UI's displayed gross sales against a raw `SELECT SUM(Total) FROM Slips WHERE <same date filter>` via `sqlcmd`
- [ ] **Chemical usage over-limit rejection** — log usage exceeding remaining stock, confirm it's rejected with the correct message, not silently accepted or a crash

## 7. Update flow (only possible with two real published releases — see step 1's note)

Per `release_pipeline.md` §6 Step 8: this cannot be tested any other way. Tag and publish a second version after step 1's release, then on the machine still running the first version:

- [ ] Open "Check for Updates" (in the admin popup — click the account name/avatar at the bottom of the sidebar)
- [ ] It reports the new version is available, showing both current and available version numbers
- [ ] Click "Update Now" — it downloads (progress not currently surfaced in the UI, just a "Downloading..." button state — note if this feels too silent for a real user) and the app restarts into the new version
- [ ] Re-run a piece of step 6 (e.g. login + one stock check) post-update to confirm nothing broke in the swap
- [ ] Separately: re-run the installer for the *new* version manually (not via auto-update) over the *first* version, to confirm the update-detection logic in `installer.nsh` correctly skips the password page (same marker-based check as step 3a) and `setup-sqlserver.ps1` correctly runs in its update/repair mode

## 8. Report back

For each checkbox: pass/fail and exact error text if it failed. Then update:

- `TASKS.md` — mark the relevant Group 6 tasks' Windows-verification caveats with real results (Tasks 21, 23, 24, 25 all have an "unverified on real Windows" note pointing here)
- `DECISIONS.md`'s pipeline-adoption entry and the code-signing entry — confirmed-working or the specific failure and what it needs

If anything fails, log it as a new numbered `TASKS.md` task rather than patching the failing script blind — nobody without Windows access can iterate against it, so a failure report needs the exact error and exact step for whoever picks it up next (on or off Windows) to reason about without re-running everything.
