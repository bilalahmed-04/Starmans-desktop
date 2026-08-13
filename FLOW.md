# Flow — Execution Order & Session Change Log

> Documents (1) how the system runs — entry point, startup order, and function call flow — and (2) what code was actually touched, and why, in each work session. Section 1 is a **living architecture reference**, updated as real code is built. Section 2 is an **append-only changelog**, one entry per session, never rewritten retroactively.

---

## 1. Execution Flow

> **Status as of 2026-08-13 (updated):** MSSQL foundation is now in place (connection layer + schema), but no route has been migrated yet — the backend still runs on MongoDB for all actual request handling. This section remains a forward-looking scaffold for §1.2–1.4 until routes migrate (see `TASKS.md` Groups 1–4); only the pieces that now exist are filled in below.

### 1.1 Entry point
*To be filled in once the Electron main process file exists (e.g. `electron/main.js`).*
- What file Electron loads first
- What it does on `app.whenReady()`

### 1.2 Startup order
> **Updated 2026-08-13 — reflects the IPC decision** (see `DECISIONS.md`, "REVERSED: adopt Electron IPC, not localhost HTTP"). The HTTP-shaped version below is struck through for reference; not current guidance.

*To be filled in as the Electron shell (`TASKS.md` Group 5) is built.* Expected shape, per the IPC decision:
1. Electron main process starts
2. Main process connects to the local MSSQL instance
3. On first run only: schema/migration check — creates tables if the database is empty
4. Main process registers all `ipcMain.handle` channels synchronously (per `TASKS.md` Task 14) — no server to bind, no port to allocate or inject
5. Main process creates the `BrowserWindow` and loads the React frontend (via `preload.js`'s `contextBridge`)
6. Frontend (`AppContext.tsx`) fires its initial data-fetch calls via `window.api.*` (IPC), not `fetch()`

~~Superseded HTTP-shaped version: Express server binds a dynamically-allocated `127.0.0.1` port → Express connects to MSSQL → main process passes the assigned port to the renderer before `loadURL()` → frontend calls `fetch()` against that port.~~ Kept struck through, not deleted, as a record of the original plan.

### 1.3 Request/function call flow (per domain area)
> **Updated 2026-08-13 — IPC-shaped, not HTTP-shaped** (see `DECISIONS.md` reversal entry).

*To be filled in per route as each one gets its Group 5 (`TASKS.md`) IPC treatment.* Will follow this format once populated:

```
[Frontend action] → [lib/*.ts function] → [window.api.<feature>.<action>()] → [preload contextBridge] → [ipcMain.handle] → [service function (Task 13)] → [SQL query/queries] → [{ ok, data } envelope] → [reducer dispatch] → [UI update]
```

Example placeholder (not yet real — current code still calls the Express route directly, not via IPC; see `Desktop_app/Backend/src/routes/slips.js`):
```
NewSalePage confirm → lib/slips.ts createSlip() → window.api.slips.create(payload) → preload → ipcMain.handle('slips:create') →
  [pending: Task 13's extracted service function, reusing Task 9's already-migrated SQL transaction — validate stock, insert Slip + SlipItems, update Article stock] →
  { ok: true, data: slip } → AppContext dispatch → SlipDetailPage renders
```

~~Superseded HTTP-shaped placeholder: `POST /slips` → Express route handler → SQL → JSON response over `fetch()`.~~ The underlying SQL logic in Task 9 is unaffected by this change — only the transport chain above it changes.

### 1.4 Key modules and their responsibilities
*To be filled in as each is built/rewritten. Placeholder list based on the current (pre-migration) codebase, to be updated in place as files change:*

> **Path note:** all `Backend/` and `frontend/app/` paths below are now under `Desktop_app/` (i.e. `Desktop_app/Backend/...`, `Desktop_app/frontend/app/...`) — moved in this session, see the change-log entry below and `DECISIONS.md`. Shortened prefix kept in this table for readability.

| Module | Current responsibility | Migration status |
|---|---|---|
| `Backend/src/index.js` | Express app entry point, route mounting | MongoDB fully removed — connects to MSSQL only (fatal on failure), Task 12 |
| `Backend/src/db.js` | MongoDB connection | **Deleted** (Task 12) |
| `Backend/src/store.js` | Legacy in-memory placeholder, unused | **Deleted** (Task 12) |
| `Backend/src/mssqlDb.js` | MSSQL connection pool (`mssql`/tedious), exports `connectMSSQL()`/`getPool()`/`sql` | Created (Task 1), unchanged since |
| `Backend/migrations/001_initial_schema.sql` | All 14 SQL tables, FKs, indexes, constraints | Created (Task 1) — **still not run against a live database**, blocked on the `sa` password (see `DECISIONS.md`); this is the one open item left in the whole migration |
| `Backend/src/models/*.js` | MSSQL query modules (Article, Client, Settings, ChemPurchase, ChemUsage, Expense, Bill, Production, Slip, Payment, Profit) | **All migrated** — Mongoose fully removed (Tasks 2–12) |
| `Backend/src/routes/*.js` | Route handlers + business logic, Express `req`/`res`-shaped | **All 10 route files MSSQL-backed** (Tasks 2–11). Still Express-shaped, not yet IPC-shaped — see `TASKS.md` Group 5 (Task 13 onward), separate follow-on work, not started |
| `frontend/app/src/lib/*.ts` | Frontend API call helpers, currently `fetch()`-based | **Changed scope as of the IPC decision:** no longer "just a base-URL/port change" — full rewrite to `window.api.*` IPC calls, see `TASKS.md` Task 15. Not started. |
| `Desktop_app/` (top level) | Now contains the entire desktop product: `Backend/`, `frontend/app/`, and (once built) the Electron shell (`main.js`, `preload.js`, packaging config) | `Backend/` and `frontend/app/` relocated here (`git mv`, history preserved). Electron shell code itself still not started — Task 0 (localhost-HTTP vs. IPC) is now resolved (**IPC**, see `DECISIONS.md`), but shell work practically waits on Group 5 (`TASKS.md`), specifically Task 13. |

---

## 2. Session Change Log

> One entry per work session. Each entry lists what was actually changed, in which files, and why — cross-referencing `DECISIONS.md` where a change stems from a logged decision.

### Session — 2026-08-13

**What changed:**
- Created `ANALYSIS.md` — full repo walkthrough (pre-migration codebase, MongoDB + browser-based React app)
- Created `EFFORT_ANALYSIS.md` — scoped the MongoDB→MSSQL and Electron migration effort
- Created `PROPOSED_PLAN.md` — documented the localhost-HTTP-in-Electron architecture and dynamic port allocation approach
- Created `DECISIONS.md` — decision log, seeded with 6 decisions made this session (see file for full detail)
- Created this file, `FLOW.md`
- Modified `~/.zshrc` (outside the repo, local dev machine only) — added `/opt/mssql-tools18/bin` to `PATH` so `sqlcmd` is usable in zsh sessions

**No application code was modified this session.** `Backend/` and `frontend/app/` remain exactly as they were at the start of the session (MongoDB/Mongoose backend, browser-oriented React frontend) — nothing here has started the actual migration yet.

**Why:** This session was entirely planning/scoping work — understanding the existing codebase, deciding on the target architecture, and preparing the environment (confirmed Node.js, MSSQL, Docker, and `sqlcmd` availability on the dev machine per the earlier system check) ahead of writing any migration code.

**Next expected session:** Likely start of actual implementation — either SQL schema design (`§1` of `EFFORT_ANALYSIS.md`) or Electron shell scaffolding, per whichever the user prioritizes first.

---

### Session — 2026-08-13 (continued) — MSSQL foundation + task breakdown

**What changed:**
- `Backend/package.json` — added `mssql` dependency (kept `mongoose` for the transition period); ran `npm install` successfully (168 packages, no install errors; `npm audit` reports 1 pre-existing high-severity advisory in the dependency tree, not investigated this session)
- Created `Backend/src/mssqlDb.js` — new MSSQL connection pool module (`connectMSSQL()`, `getPool()`, re-exports `sql`), logs only host/port/db name on connect, never credentials
- `Backend/src/index.js` — now imports and calls `connectMSSQL()` alongside the existing `connectDB()` (MongoDB); MongoDB connection failure stays fatal (unchanged behavior), MSSQL connection failure is logged but non-fatal during the transition
- Created `Backend/.env.example` — first env template committed to the repo (didn't exist before), covers both legacy Mongo and new MSSQL vars
- Created `Backend/migrations/001_initial_schema.sql` — all 14 tables from the `ANALYSIS.md`/`EFFORT_ANALYSIS.md` schema design, with FKs, indexes, and the `ON DELETE SET NULL` (not `CASCADE`) convention for `ProductionEntries.ArticleId`
- Created `Backend/migrations/README.md` — how to run/add migrations
- Verified `node --check` passes on both new/modified JS files
- Updated `DECISIONS.md` — logged the MSSQL data-access approach decision (raw `mssql` driver, `INT IDENTITY` ids, hand-written migrations) and the transition approach (Mongo stays until full cutover)
- Rewrote `TASKS.md` — full task breakdown of the remaining migration work into 12 tasks across 4 dependency groups (Task 1, this session's work, marked `completed`; Tasks 2–12 `not_completed` and ready for other agents to claim)

**Not done yet:** the migration SQL has not actually been run against the local MSSQL instance (still blocked on the `sa` password — see `DECISIONS.md` "Development environment" entry). No route files or models were touched — the backend still serves all current traffic through MongoDB exactly as before; this session only added the MSSQL connection alongside it.

**Why:** Per the user's request to get the MSSQL foundation in place and divide the remaining route/model migration work into parallelizable tasks, while Electron/transport work stays blocked on the client's pending IPC-vs-localhost decision (unrelated to this work — see `TASKS.md` "Blocking dependency" section, clarified this session to note the DB migration doesn't depend on that decision).

**Next expected session:** Get the `sa` password resolved and run `001_initial_schema.sql`, then start picking up Group 1 tasks (`Task 2`–`Task 7` in `TASKS.md`) — these have no dependencies on each other and are the best candidates for parallel agent work.

---

### Session — 2026-08-13 (continued) — Desktop_app folder scaffolded

**What changed:**
- Created `Desktop_app/` (new top-level folder) with a `README.md` documenting its scope: Electron shell only (main process, packaging config) — does not duplicate `Backend/` or `frontend/app/`, bundles them at build/package time instead
- Updated `DECISIONS.md` — logged why `Desktop_app/` is shell-only rather than a self-contained duplicate (single `.exe` output comes from `electron-builder` packaging, not from source duplication)
- Updated `TASKS.md` — noted the new folder under the "Blocking dependency" section; did not touch Tasks 1–12, which by this point had been claimed/worked/completed by other agent sessions in parallel (Tasks 1–4 `completed`, Task 5 `working` — see their entries for what actually changed in `Backend/src/models/` and `Backend/src/routes/`, not authored in this sub-session)
- Updated this file's §1.4 module table to reflect both the Desktop_app folder and the parallel Group 1 progress made by other sessions

**No `Backend/` or `frontend/app/` files were touched in this sub-session** — only the new `Desktop_app/` folder and the four tracking docs.

**Why:** User asked for a new `Desktop_app/` folder for all desktop-specific work, explicitly "without touching anything else." Clarified via the quiz process that this meant shell-only (not a duplicate codebase), since the client's single-`.exe` requirement is satisfied by packaging, not source layout.

**Still blocked:** actual Electron code (`main.js`, `electron-builder` config) inside `Desktop_app/` — waiting on Task 0 (client's localhost-HTTP vs. IPC decision).

---

### Session — 2026-08-13 (continued again) — Backend/ and frontend/app/ relocated into Desktop_app/

**What changed:**
- `git mv Backend Desktop_app/Backend` and `git mv frontend Desktop_app/frontend` — full relocation (history preserved, not a copy), including `node_modules` and all in-progress uncommitted MSSQL migration work (Tasks 1–5)
- Updated `.gitignore` — `Backend/create-admin.js`, `Backend/wipe-data.js`, `frontend/app/.env` entries re-pointed to their new `Desktop_app/`-prefixed paths so they keep being ignored
- Verified post-move: `node --check` passes on `Desktop_app/Backend/src/index.js`, `mssqlDb.js`, `db.js`; a live `import()` of `mssqlDb.js` succeeds from the new location
- Rewrote `Desktop_app/README.md` — now describes the folder as home to the whole desktop product (backend + frontend + eventual Electron shell), not shell-only
- Added a new entry to `DECISIONS.md` revising the prior "shell-only" entry — the *don't-duplicate* reasoning still holds, only the *location* changed
- Added path notes to `TASKS.md` (top of file + the Desktop_app blocking-dependency note) and `FLOW.md` (§1.4 table) pointing at the new `Desktop_app/`-prefixed paths, without rewriting every individual task entry (avoids colliding with other agents' in-flight `working` tasks on the same file)

**Why:** User's explicit instruction: since the backend files were already being actively edited (Tasks 1–5 in progress from other parallel sessions), consolidate the whole desktop product — backend, frontend, and the not-yet-built Electron shell — into one self-contained `Desktop_app/` folder rather than splitting it between the repo root and `Desktop_app/`. User authorized proceeding without further confirmation.

**Known follow-up risk:** other agent sessions that had `Desktop_app/../Backend` or top-level `Backend/`/`frontend/app/` paths open in an in-progress edit (e.g. whoever is mid-`working` on Task 5) may have stale local file handles pointing at the old path — if a task's `working` status doesn't progress, check whether its agent needs to re-resolve the new `Desktop_app/Backend/` path before continuing.

**Not done:** did not rewrite path references inside `ANALYSIS.md`, `EFFORT_ANALYSIS.md`, or `PROPOSED_PLAN.md` (written before this move) — left as point-in-time snapshots per `DECISIONS.md`'s own append-only convention, noted explicitly there.

---

### Session — 2026-08-13 (continued again) — Group 1 (Tasks 2–7) completed

**What changed** (all under `Desktop_app/Backend/`, resuming from the new path after the relocation above):
- `src/models/ChemPurchase.js` + `src/models/ChemUsage.js` rewritten as plain MSSQL query functions; `src/routes/chemicals.js` rewritten. `POST /usage`'s stock check now runs inside a `SERIALIZABLE` transaction with `WITH (HOLDLOCK)` reads (`createChemUsagesWithStockCheck`) to close the same check-then-insert race class flagged for Task 9's stock deduction.
- `src/models/Expense.js` rewritten (`findExpenses`, `createExpenseWithRows` — transactional parent+child insert); `src/routes/expenses.js` rewritten. `month`/weekly-range filters now use real `DATE` comparisons instead of string regex (EFFORT_ANALYSIS.md §1.2 item 4), reusing the existing `dateHelpers.js` helpers unchanged.
- `src/models/Bill.js` rewritten (`findBills`, `createBillWithEntries` — transactional parent+child insert); `src/routes/bills.js` rewritten, same real-`DATE`-range filter treatment.
- Verified `node --check` passes on every new/modified file.
- `TASKS.md` — Tasks 5, 6, 7 marked `completed` with per-task notes (including each one's known transient breakage in not-yet-migrated files).

**Known transient breakage carried forward (expected, tracked, resolved by end of this multi-task session):**
- `slips.js`, `productions.js` still import the old default `Article`/`Client` Mongoose exports (since Task 2/3)
- `payments.js` still imports the old default `Client` export (since Task 3)
- `profit.js` still imports the old default `ChemPurchase`, `Expense`, `Bill` exports (new this session, joining `Article`-adjacent breakage) — all resolved when Tasks 8–11 land later in this same session

**Why:** Continuing the user's instruction to work through `TASKS.md` in order, claiming each task as `working` before starting and `completed` after, one continuous single-agent session — Group 1 (Tasks 2–7) has no dependencies between its members, so it was worked sequentially task-by-task rather than requiring separate parallel agents.

**Next:** Group 2 (Tasks 8–10: Production, Slip, Payment) — Task 9 (Slip) is flagged as the highest-complexity task in the whole migration (stock-deduction race fix, client dedupe/phone-conflict branching, `.populate()` → real `JOIN`).

---

### Session — 2026-08-13 (continued again) — Reversed transport decision: IPC, not localhost HTTP

**What changed (docs only, no application code):**
- Read and evaluated `IPC_VS_HTTP_FINDINGS.md` (root of repo, authored by Claude Fable 5) — a per-property comparison of Electron IPC vs. localhost HTTP evaluated against this app's actual deployment model (auto-update, silently-provisioned local MSSQL, single machine/user)
- `DECISIONS.md` — added a new entry reversing the earlier "keep localhost HTTP" decision (did not edit that entry, per this file's own append-only convention); also flagged the now-moot "dynamic port allocation" entry as historical-only
- `TASKS.md` — marked Task 0 `completed` (decision: IPC); added **Group 5** (Tasks 13–16): extract business logic from Express handlers into plain service functions, build the Electron IPC layer (`preload.js`, `ipcMain.handle`, `{ ok, data }` envelope), rewrite `frontend/app/src/lib/*.ts` (9 files) to IPC calls, and `electron-builder` packaging — scaffolded at the same level of detail Groups 2–4 originally were, not deeply implemented. Flagged one open question (whether Express stays as a dev-only test harness). Did **not** touch Tasks 1–11's existing status/notes — those describe real, valid completed MSSQL work, unaffected by the transport reversal.
- `PROPOSED_PLAN.md` — added a superseded banner under the title, body left unchanged (kept as historical record)
- `EFFORT_ANALYSIS.md` — added a note after §2.2's recommendation pointing at the reversal, section left unchanged
- This file (`FLOW.md`) — updated §1.2 (startup order) and §1.3 (request/call-flow example) from HTTP-shaped to IPC-shaped (old versions struck through, not deleted); updated §1.4's module table rows for `routes/*.js`, `frontend/app/src/lib/*.ts`, and `Desktop_app/` to reflect the new Group 5 scope; also refreshed the `models/*.js` and `routes/*.js` rows, which had gone stale (pointed readers to `TASKS.md` instead of restating counts that change too often to keep accurate here)

**Why:** User read the Findings doc and instructed switching the decision, per the plan approved at `~/.claude/plans/melodic-coalescing-narwhal.md`. The reversal is logged honestly as a second decision on the same question (not a retroactive rewrite of the first), and the real downstream cost — every already-migrated route's handler shape needs to change under IPC — is captured as new task-board scope rather than silently absorbed into already-`completed` tasks.

**Not done:** no application code — no `preload.js`, no `ipcMain` handlers, no `lib/*.ts` rewrites. That's Group 5, not yet started.

**Next:** Group 2/3 MSSQL work continues independently (Task 10 `working` as of this entry) — Group 5 (IPC layer) can start in parallel once enough of Tasks 2–11 are done for Task 13's extraction to be worth doing once rather than twice.

---

### Session — 2026-08-13 (continued again) — Tasks 10–12 completed: MSSQL migration finished

**What changed** (all under `Desktop_app/Backend/`):
- `src/models/Payment.js` rewritten (`findPayments`, `createPayment`); `src/routes/payments.js` rewritten, reusing `findClientByNameCaseInsensitive` from Task 3's `Client.js` rather than duplicating the lookup. Search input bracket-escaped against SQL `LIKE` wildcards. `payments.js` dropping its old default `Client` import closed the last piece of Task 3's transient breakage.
- New `src/models/Profit.js` (`calcMonth`, `calcYear` — the latter using `GROUP BY MONTH(Date)` to cover all 12 months in 4 queries instead of the old per-month document fetches); `src/routes/profit.js` rewritten. `grossSales` sums `Slips.Total` directly, no `SlipItems` join, per the fan-out warning in `TASKS.md`/`EFFORT_ANALYSIS.md` §3. Two old behavioral quirks (`/annual`'s `Jan..currentMonth`-of-today range regardless of requested year; `/analytics`'s full-12-month annual total) preserved exactly, not "fixed."
- Confirmed via `grep -rn "^import [A-Z][a-zA-Z]* from '\.\./models"` across `src/routes/*.js` that **no route file imports an old default Mongoose export anymore** — the app is internally consistent for the first time since Task 2 (every prior Group 1/2 task note's "known transient breakage" is now resolved).
- Task 12: `npm uninstall mongoose` (19 packages removed, `package.json`/`package-lock.json`/`node_modules` all updated); deleted `src/db.js` and `src/store.js` (confirmed unused first); `src/index.js` now connects to MSSQL only; `.env.example`'s `MONGODB_URI` block removed; `seed.js` rewritten against MSSQL (dependency-ordered wipe + `DBCC CHECKIDENT` reseed + parameterized inserts for the same demo dataset, bypassing route-layer business logic on purpose since bulk seeding isn't the right caller for e.g. `createSlip`'s dedupe/stock-deduction transaction).
- Verified: `node --check` on every backend `.js` file; `grep` confirms zero `mongoose` references left in `src/`/`seed.js`; `node src/index.js` boots cleanly through every import and route mount, failing only at the MSSQL connection step on the still-missing `sa` credentials.
- `TASKS.md` — Tasks 10, 11, 12 marked `completed` with full per-task notes; all 12 original tasks (Groups 0–4) are now `completed`.

**Not done — the one concrete open item:** the `sa` password for the local MSSQL instance was never resolved this session (flagged as an open item as far back as Task 1). Did not attempt to search for it outside the repo — a sandboxed system-wide search was denied by the permission classifier mid-session, and re-routing around that denial would have been inappropriate. Without it: `001_initial_schema.sql` has still never been run against a live database, `seed.js` has never actually populated one, and no endpoint has been smoke-tested end-to-end against real data. Every task in this session was verified as far as static analysis allows (`node --check`, import-graph greps, a clean boot up to the connection attempt) but not with a live query.

**Why:** Continuing the single-agent pass through `TASKS.md` in dependency order — Group 2 (Production, Slip, Payment) needed Group 1's Articles/Clients tables to exist first, and Group 3/4 (profit aggregation, final Mongoose removal) needed everything else done first. Worked sequentially rather than needing separate parallel agents since one session covered the whole board.

**Next:** Get the `sa` password (or an equivalent MSSQL login) resolved, run `001_initial_schema.sql` and `seed.js` against a live instance, and do the real end-to-end smoke test Task 12 couldn't complete. After that, the MSSQL migration is fully done and verified; remaining repo work is Group 5 (Electron IPC layer, Tasks 13–16), a separate effort started by another session after the Task 0 reversal.
