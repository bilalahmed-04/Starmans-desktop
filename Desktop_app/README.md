# Desktop_app

Home of the entire desktop version of this app: the backend, the frontend, and (once built) the Electron shell that wraps them into a single Windows installer. See `DECISIONS.md` for the two folder-layout decisions behind this (the original shell-only proposal, then its revision into a full relocation).

## Layout

```
Desktop_app/
├── Backend/          Express + MSSQL API (relocated from the former top-level Backend/, mid-migration — see TASKS.md)
├── frontend/app/      React + Vite frontend (relocated from the former top-level frontend/app/)
└── (once built) main.js, preload.js, electron-builder config — the Electron shell itself
```

`Backend/` and `frontend/app/` are **not copies** — they were moved here (via `git mv`, history preserved), not duplicated. There is no other copy of this code anywhere else in the repo.

## What still needs to be built here

- `main.js` — Electron main process: starts `Backend/` in-process on a dynamically-allocated local port, creates the `BrowserWindow`, loads the built `frontend/app/` output
- `preload.js` — only if native OS integration is needed later (file save dialogs, printing)
- `package.json` / `electron-builder` config — packages this whole folder into a single Windows installer `.exe`

**Blocked on Task 0** in `TASKS.md` (the client's decision on localhost-HTTP vs. Electron IPC) — the main process's transport wiring depends on which approach is chosen. See `PROPOSED_PLAN.md` for the recommended (localhost-HTTP) approach, pending confirmation.

## What's unblocked and already in progress

The MSSQL migration inside `Desktop_app/Backend/` (see `TASKS.md` Groups 1–4) doesn't depend on Task 0 and is already underway — several route files have been migrated from MongoDB to MSSQL. Check `TASKS.md` for current task status before picking up new work.
