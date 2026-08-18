# Starmans Sole House — Windows Deployable

Everything needed to install and run the app on a Windows machine.

## What's in here

| File | What it is |
|---|---|
| `Starmans-Sole-House-Setup-1.0.9.exe` | **The installer.** ~795MB — self-contained, nothing else to download. |
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
   - a **backup folder** (defaults to `Starmans Backup` on the first non-system drive found, e.g. `D:\Starmans Backup` — falls back to `Documents\Starmans Backup` on a single-drive machine)
5. **Wait.** After the wizard, SQL Server Express installs in the background — several minutes, no visible console window (that's intentional as of 1.0.8). Watch the install page's details list for a "Setting up the database..." line. Don't kill it.
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

## Backups

- **Automatic:** every hour, while the app is running, a full database backup (`.bak`) is written to the backup folder chosen during install (`C:\ProgramData\Starmans\app-config.json` records where — look for `backupFolder`). Silent by design; check `C:\ProgramData\Starmans\backup.log` to confirm it's running or to diagnose a failure.
- **Manual, to a USB drive or any other folder:** Settings → Database Backup → "Backup to External Drive...". Runs a fresh backup on the spot and saves it wherever you browse to.

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

> **If you tested an earlier build and found no logs at all:** that wasn't you
> looking in the wrong place. Before 1.0.5 the setup script failed to parse and
> never ran, so no log was ever written anywhere. Fixed in 1.0.5.

The app still installs even if database setup fails — so it may launch and then
fail to connect. Same root cause; the logs above are still where to look.

## Known limitations of this specific build

- **Self-signed certificate.** SmartScreen warns on first run. A real purchased certificate removes this — swapping one in is a config change, not a rebuild of the app.
- **Not yet verified end-to-end on Windows.** The installer wizard and the SQL Server *installer step* are both confirmed reaching real Windows now (the password page renders and validates; the bundled SQL Server installer actually launches). What's still unconfirmed is a **clean pass all the way through** — every attempt on real Windows so far hit a real bug along the way (see "What changed" below for each one and how it was fixed). `INSTALL-CHECKLIST.md` is what to work through.

## Getting later versions

The app's **Check for Updates** (in the app) reads GitHub Releases directly, so
once a new version is published the client can update in place — no reinstall,
no new download to hand over.

Releases live at:
`https://github.com/bilalahmed-04/Starmans-desktop/releases`

## Version

- **App version:** 1.0.9
- **Signed:** No — this copy is built locally, and the Linux signing tool can't
  run here. The equivalent build published to GitHub Releases *is* signed
  (CI runs `signtool.exe`), so prefer the release download if you want the
  signed one. Either way it's a *self-signed* certificate, so SmartScreen warns
  regardless — see "Installing" above.

### What changed in 1.0.9

**The database setup now actually gets to the end.** 1.0.8 testing produced the
first logs showing setup running all the way through: SQL Server Express
installed cleanly, TCP/IP and the port were configured, and the script
successfully logged in to configure the `sa` account. It then failed on the
very last step with `Incorrect syntax near '@pwd'` — the command that sets the
`sa` password was written in a form SQL Server does not accept. That command
has been rewritten. This was the failure behind the "install crash" noted in
1.0.8 below.

**A repeated install no longer drifts onto a new port each time.** If setup got
as far as claiming port 1433 and then failed, the next attempt saw 1433 as
"taken" — by its own instance — and moved to 1434, then 1435, and so on. It now
recognises its own instance and keeps the port it already has.

> **Note:** the two 1.0.8 log runs also confirmed that 1.0.7's named-pipes
> fix works — the "untrusted domain" login failure from 1.0.7 testing did not
> recur.

### What changed in 1.0.8

**The blank console window is gone.** 1.0.7 testing showed a real, visible
terminal sitting blank for the entire multi-minute SQL Server install — all
output was going to the log file, not the window, so it looked exactly like a
hang even though it was working. That window is now hidden entirely, and the
install page shows a "Setting up the database..." line instead.

This does not fix the SQL Server install crash itself (exit code 1) reported
during 1.0.7 testing — that's still open, pending the setup logs from the
machine it happened on.

### What changed in 1.0.7

Two bugs found by a real fresh-install attempt and a real repair attempt on
Windows 11, both confirmed by actual install logs rather than reasoning:

- **SQL Server Express installation failed on every fresh install** with
  `The setting 'SAPWORD' specified is not recognized.` The setup script has
  been passing the wrong parameter name to the SQL Server installer since it
  was first written - the correct name is `SAPWD`. This bug existed through
  every prior version; it only became visible once 1.0.5's encoding fix let
  the script run far enough to reach it.
- **Repairing a machine that already has a SQL Server instance failed** with
  `Login failed. The login is from an untrusted domain and cannot be used
  with Integrated authentication.` Windows Integrated auth over a TCP loopback
  connection can hit an NTLM restriction on some machines. The script now
  tries named pipes first (the standard workaround), then two TCP fallbacks,
  and if all three fail it reports exactly which Windows identity was
  attempted and what to check, instead of a raw .NET error.

### What changed in 1.0.6

**If this machine already has SQL Server, it is left completely alone.** The
app installs its own separate instance and, if port 1433 is already taken,
quietly uses the next free port instead. Nothing about the existing SQL Server
is reconfigured - no password reset, no service restart, no port stolen. The
app records whichever port it ends up on and connects there.

**The setup script now actually runs.** Up to and including 1.0.4 it never
executed a single line: the file was UTF-8 without a byte-order mark and
contained em-dashes and box-drawing characters (in comments, of all places).
Windows PowerShell reads such a file as ANSI, which turned each of those into
garbage that closed string literals early — so the script failed to *parse*.
That is also why no log ever appeared: a script that can't parse can't write
its own log. It is now pure ASCII with a BOM, and the build refuses to proceed
if that ever regresses.

Fixes shipped in 1.0.4 that were written but never reached, and which take
effect for the first time here:

- **The bundled SQL Server installer couldn't be found** — the script looked one
  directory too high, which would fail on any machine without SQL Server present.
- **Logs went somewhere unfindable** (the elevated installer's `%TEMP%`, not
  yours). They are now in `C:\ProgramData\Starmans\`, with a second file
  capturing failures that happen before the script can log anything itself.
- **Dynamic ports would have silently defeated the fixed port** — SQL Server
  Express defaults to dynamic ports, which override the 1433 the app connects
  to. That would have looked like "setup succeeded but the app can't connect".
- The script now records which SQL Server instances already exist and whether
  port 1433 is taken, so an "already installed" conflict is visible rather than
  guesswork.

1.0.0–1.0.3 were not usable releases at all — those builds either published no
installer or produced an update feed pointing at a missing file. See
`DECISIONS.md` for the full history.
