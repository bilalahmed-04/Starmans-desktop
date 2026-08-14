# Install Checklist — tick these while testing on Windows

The short version of `Desktop_app/WINDOWS_INSTALLER_VERIFICATION.md`, focused on
what's most likely to break. Nothing in this list has ever been observed running
on real Windows before — every box is a genuine unknown, not a formality.

## Install

- [ ] UAC prompt appears, accepting it lets the installer continue
- [ ] SmartScreen warning appears → "More info" → "Run anyway" works
- [ ] **The custom database-password page appears** (password twice + backup folder)
- [ ] Entering **mismatched** passwords is rejected with a clear message
- [ ] Entering a password **shorter than 8 characters** is rejected
- [ ] Choosing a backup folder via "Browse..." works
- [ ] Install completes without an error dialog
- [ ] **SQL Server Express actually installed** — check Services (`services.msc`) for a service named `SQL Server (SQLEXPRESS)`, running
- [ ] `C:\ProgramData\Starmans\app-config.json` exists

## First launch

- [ ] The app opens (no error dialog on startup)
- [ ] The login screen shows the **`admin` / `admin` banner**
- [ ] Logging in with `admin` / `admin` works
- [ ] The main screen loads with the sidebar and no visible errors

## Core functionality

- [ ] **New Sale** — create a slip, confirm it saves
- [ ] **Stock** — the article you just sold has its quantity reduced by the right amount
- [ ] **Production** — enter a quantity, confirm stock goes *up*
- [ ] **Profit** — the monthly view loads and shows numbers
- [ ] **Chemical** — try logging usage larger than what's in stock; it should be rejected

## Password change

- [ ] Change the app password from the account menu
- [ ] Sign out — **the `admin`/`admin` banner is now gone**
- [ ] Signing back in with the *new* password works
- [ ] Signing in with `admin`/`admin` now **fails**

## Reinstall / repair (worth doing if you have time)

- [ ] Run the same installer again over the existing install
- [ ] **The database-password page is skipped** this time (it detects an update)
- [ ] The app still opens and your data from before is still there

## If something fails

Capture both of these before doing anything else:

1. `%TEMP%\sqlserver-setup.log` — the full step-by-step log from the setup script
2. The exact text of any error dialog

Those two are usually enough to pinpoint the failure without a second test run.

## Most likely failure points, in order

1. **SQL Server Express silent install** — the single riskiest step; never run outside a Linux dev box
2. **The custom NSIS wizard page** — compiles correctly, but has never been *displayed* on Windows
3. **`app-config.json` path/permissions** — written to `%ProgramData%` by an elevated process; if the app can't read it back, login fails with a database error
