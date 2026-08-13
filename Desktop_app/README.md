# Desktop_app

Home of the entire desktop version of this app: the backend, the frontend, and the Electron shell that wraps them into a single Windows installer. See `DECISIONS.md` for the folder-layout decisions and the transport-architecture decisions (localhost HTTP was the original plan, then reversed to Electron IPC — see the "REVERSED" and "Group 5" entries).

## Layout

```
Desktop_app/
├── Backend/            MSSQL data-access layer — models/*.js (query functions) + services/*.js
│                        (business logic). Not a standalone server: no Express, no HTTP server, no
│                        JWT. Called directly by main.js's IPC handlers. See Backend/README.md.
├── frontend/app/        React + Vite frontend — calls window.api.* (no fetch(), no HTTP)
├── main.js              Electron main process — provisions/connects to MSSQL, registers all
│                        ipcMain.handle channels (wired to Backend/src/services/*.js), creates
│                        the BrowserWindow
├── preload.js            contextBridge — exposes window.api.<feature>.<action>(...), one explicit
│                        function per IPC channel (see DECISIONS.md's Group 5 entry for why)
├── scripts/             First-run MSSQL provisioning (schema creation + best-effort SQL Server
│                        Express install — see that folder's own caveats)
└── package.json         Electron + electron-builder live here, separate from Backend/'s own
                         package.json
```

`Backend/` and `frontend/app/` are **not copies** — they were moved here (via `git mv`, history preserved), not duplicated. There is no other copy of this code anywhere else in the repo.

## Architecture: Electron IPC, not localhost HTTP

The renderer (frontend) talks to the main process (which owns the MSSQL connection) over Electron IPC — `window.api.*` calls in the renderer, `ipcMain.handle` in `main.js`. **There is no HTTP server anywhere in this app** — Express was fully removed in Task 17. See `IPC_VS_HTTP_FINDINGS.md` for the comparison that led to choosing IPC over the original localhost-HTTP plan.

**Error convention:** every IPC call resolves an envelope — `{ ok: true, data }` on success, `{ ok: false, error: { message, code } }` on failure. `ipcMain.handle` never throws (Electron strips custom error properties like `.code` crossing the boundary, so throwing would lose structured error info like `phone_conflict` or `insufficient_stock`).

**No JWT** — every call already only ever originates from this app's own renderer process inside the OS process boundary, so there's no remote attacker for a token to defend against. `auth:login` just verifies username/password against `Settings` (bcrypt) and returns `{ username }`, no token, no session.

## Status: Group 5 (Tasks 13–17) complete

All of `TASKS.md`'s task board — the MSSQL migration (Tasks 1–12) and the Electron IPC layer (Tasks 13–17) — is done and verified, including a real end-to-end test: an actual rendered window, driven via Chrome DevTools Protocol exactly like a user would (real keystrokes into the login form, a real button click), confirming login, stock deduction on slip creation, profit aggregation, and chemical-usage over-limit rejection all work correctly through the real IPC path with Express completely removed.

**One caveat still open:** `scripts/ensureSqlServer.js`'s SQL Server Express silent-install has never run on a real Windows machine (this whole project was developed on Linux) — see that file's own header comment and `DECISIONS.md`. Needs real-Windows verification before this installer goes near a client machine.

## Running it during development

```
cd Desktop_app && npm install          # electron, electron-builder, dotenv
cd Backend && npm install              # mssql, bcryptjs, dotenv
cd frontend/app && npm install && npm run build   # produces dist/, which main.js loads
cd Desktop_app && npm start            # electron .
```

`Backend/.env` needs MSSQL credentials (copy `Backend/.env.example` → `Backend/.env`, gitignored).
