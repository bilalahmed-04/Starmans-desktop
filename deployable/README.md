# Starmans Sole House — Windows Deployable

Everything needed to install and run the app on a Windows machine.

## What's in here

| File | What it is |
|---|---|
| `Starmans-Sole-House-Setup-1.0.4.exe` | **The installer.** ~795MB — self-contained, nothing else to download. |
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

Two log files, both in the same fixed folder:

```
C:\ProgramData\Starmans\sqlserver-setup.log      ← what the setup script did
C:\ProgramData\Starmans\installer-powershell.log ← raw output, incl. crashes
```

(Paste `C:\ProgramData\Starmans` into Explorer's address bar — the folder is
normally hidden.) Send both, plus the exact text of any error dialog.

The second file exists because the first can't record a failure that happens
*before* the script starts. Together they cover every case.

> **Note for anyone following older instructions:** earlier versions logged to
> `%TEMP%`, which was a mistake — the installer runs elevated, so its `%TEMP%`
> is the *administrator's*, not yours, and the log appeared to be missing
> entirely. Fixed in 1.0.4.

The app still installs even if database setup fails — so it may launch and then
fail to connect. Same root cause; the logs above are still where to look.

## Known limitations of this specific build

- **Self-signed certificate.** SmartScreen warns on first run. A real purchased certificate removes this — swapping one in is a config change, not a rebuild of the app.
- **Not yet verified end-to-end on Windows.** Everything here was built and tested on Linux; the installer compiles correctly on a real Windows CI runner, but the actual install/run cycle on Windows hasn't been observed yet. That's exactly what `INSTALL-CHECKLIST.md` is for.

## Getting later versions

The app's **Check for Updates** (in the app) reads GitHub Releases directly, so
once a new version is published the client can update in place — no reinstall,
no new download to hand over.

Releases live at:
`https://github.com/bilalahmed-04/Starmans-desktop/releases`

## Version

- **App version:** 1.0.4
- **Signed:** No — this copy is built locally, and the Linux signing tool can't
  run here. The equivalent build published to GitHub Releases *is* signed
  (CI runs `signtool.exe`), so prefer the release download if you want the
  signed one. Either way it's a *self-signed* certificate, so SmartScreen warns
  regardless — see "Installing" above.

### What changed in 1.0.4

Fixes for two bugs found during the first real Windows test:

- **The bundled SQL Server installer couldn't be found.** The setup script
  looked one directory too high, so on a machine without SQL Server already
  present the install would fail. Verified against the real packaged layout.
- **The log file was written somewhere you couldn't see it** (the elevated
  installer's `%TEMP%`), which is why the first test produced no log at all.

Plus two latent issues found while reviewing that code: SQL Server Express
defaults to *dynamic* ports, which silently override the fixed port 1433 the
app connects to; and the script now records what SQL Server instances already
exist and whether port 1433 is taken, so a "SQL is already installed" conflict
is visible in the log instead of being guesswork.

1.0.0–1.0.3 were not usable releases — their builds either published no
installer at all or produced an update feed pointing at a missing file. See
`DECISIONS.md` for the full history.
