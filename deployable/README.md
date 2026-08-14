# Starmans Sole House — Windows Deployable

Everything needed to install and run the app on a Windows machine.

## What's in here

| File | What it is |
|---|---|
| `Starmans Sole House Setup 1.0.0.exe` | **The installer.** ~795MB — self-contained, nothing else to download. |
| `INSTALL-CHECKLIST.md` | What to verify while installing, and what to capture if it fails. |
| `README.md` | This file. |

**The `.exe` is the whole product.** It bundles the app, its database engine (SQL Server Express, ~714MB of that 795MB), and the setup script that configures everything. The target machine needs **no** Node.js, no SQL Server, and no internet connection to install.

## Requirements on the target machine

- Windows 10 or 11, 64-bit
- Administrator rights (the installer installs a database engine — it cannot work without elevation)
- ~3GB free disk space (795MB installer + SQL Server Express once expanded)
- **No internet needed** to install or run

## Installing

1. Copy the `.exe` to the Windows machine
2. Run it → **click "Yes"** on the Windows UAC prompt
3. **SmartScreen will warn you** ("Windows protected your PC"). This build is signed with a *self-signed* certificate, which Windows doesn't recognise as a trusted authority. Click **More info** → **Run anyway**. This is expected — see "Known limitations" below.
4. Step through the wizard. One page is custom: it asks for
   - a **database password** (typed twice — this is for SQL Server, *not* your app login)
   - a **backup folder** (defaults to `Documents\Starmans Backup`)
5. **Wait.** After the wizard, SQL Server Express installs silently in the background. This is the slow part — several minutes, with little visible feedback. Don't kill it.
6. Launch the app from the Start Menu or desktop shortcut.

## First launch

Log in with:

```
Username: admin
Password: admin
```

The login screen shows a banner reminding you of this. **Change the password immediately** from the account menu — the banner disappears on its own once you do.

Two different passwords are involved, which is easy to confuse:
- The **database password** you typed during install — used internally by the app, you'll rarely need it again (keep it somewhere safe for reinstalls)
- The **app login** (`admin`/`admin`) — what you type to sign in each day

## If the install fails

The setup script logs every step. Grab this file:

```
%TEMP%\sqlserver-setup.log
```

(Paste `%TEMP%` into Explorer's address bar to get there.) That log plus the exact text of any error dialog is enough to diagnose almost anything that can go wrong here.

The app itself still installs even if database setup fails — so you may see the app launch but fail to connect. That's the same problem; the log is still the place to look.

## Known limitations of this specific build

- **Self-signed certificate.** SmartScreen warns on first run. A real purchased certificate removes this — swapping one in is a config change, not a rebuild of the app.
- **Auto-update won't work yet.** The app has a "Check for Updates" feature, but the GitHub repository it points at is private, so an installed client can't read the update feed anonymously. Until that's resolved, updates mean handing over a new `.exe`.
- **Not yet verified end-to-end on Windows.** Everything here was built and tested on Linux; the installer compiles correctly on a real Windows CI runner, but the actual install/run cycle on Windows hasn't been observed yet. That's exactly what `INSTALL-CHECKLIST.md` is for.

## Version

- **App version:** 1.0.0
- **Built from commit:** `82b7434`
- **Signed:** No (locally built copy — the CI-built one is signed, but its upload to GitHub Releases failed)
