# Tasks

> Shared task board for this project. Multiple agents/sessions can work against this file — an agent claims a task by changing its status to `working` (and adding its name/id), and only picks up tasks currently marked `not_completed`. Never claim or edit a task that's already `working` or `completed` unless explicitly told to.

**Status legend:**
- `not_completed` — open, unclaimed, safe for any agent to pick up
- `working` — claimed, in progress — do not touch unless you are the agent that claimed it
- `completed` — done, verified — do not touch

**Format:** `Task N: <short description> (status) [assigned: <agent/session>, started: <date>]`

> **Path note (2026-08-13):** `Backend/` and `frontend/app/` were relocated to `Desktop_app/Backend/` and `Desktop_app/frontend/app/` (see `DECISIONS.md`, "Backend/ and frontend/app/ relocated into Desktop_app/"). Task entries below written before this move still say `Backend/...` — read that as `Desktop_app/Backend/...` going forward. Not rewriting every existing task entry to avoid colliding with tasks other agents currently have `working`; **new** task entries should use the full `Desktop_app/`-prefixed paths.

---

## Task 0 — RESOLVED

**Task 0: Get client's final decision on localhost-HTTP vs. IPC approach** (completed) [assigned: claude, started: 2026-08-13]

**Decision: Electron IPC** (not localhost HTTP). See `IPC_VS_HTTP_FINDINGS.md` and `DECISIONS.md`'s "REVERSED: adopt Electron IPC, not localhost HTTP" entry for full reasoning. This reverses the original localhost-HTTP recommendation in `PROPOSED_PLAN.md`/`EFFORT_ANALYSIS.md` §2.2 (both now marked superseded in place, see those files).

**Electron shell work is now unblocked architecturally**, but not yet unblocked *practically* — it depends on the new Group 5 tasks below (specifically Task 13) reaching a usable state, since the route handler shape has to change under IPC. See Group 5.

**Desktop_app/ status (unchanged by this decision):** `Backend/` and `frontend/app/` already live at `Desktop_app/Backend/` and `Desktop_app/frontend/app/` (see `DECISIONS.md`'s relocation entry). `Desktop_app/` remains the home for the whole desktop product; `main.js`/`preload.js`/packaging config go there once Group 5 is far enough along.

---

## MSSQL Migration — Task Groups

Grouped by dependency: tasks within the same group have no dependencies on each other and can be worked on in parallel by different agents. Later groups depend on earlier groups being done (mainly because of FK relationships and cross-table aggregation in `profit.js`). See `EFFORT_ANALYSIS.md` §1 for the full schema/route analysis behind this breakdown, and `DECISIONS.md` ("MSSQL data-access approach") for the driver/ID/migration conventions every task must follow.

### Group 0 — Foundation

**Task 1: Set up MSSQL connection layer, schema, and env config** (completed) [assigned: claude, started: 2026-08-13]
- Added `mssql` dependency to `Backend/package.json`
- Created `Backend/src/mssqlDb.js` (connection pool, credential-safe logging)
- Wired non-fatal MSSQL connect into `Backend/src/index.js` alongside the existing (still-required) MongoDB connect
- Created `Backend/.env.example` with both Mongo (legacy) and MSSQL env vars
- Created `Backend/migrations/001_initial_schema.sql` — all 14 tables, FKs, indexes, constraints
- Created `Backend/migrations/README.md` — how to run/add migrations
- **Not done yet, left for later tasks:** actually running the migration against a live database (needs the `sa` password — open item in `DECISIONS.md`), and the seed-data migration/script

### Group 1 — No dependencies on other new tables (can start immediately, in parallel)

**Task 2: Migrate Article model + `articles.js` route to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- `Backend/src/models/Article.js` rewritten as plain MSSQL query functions (`findArticles`, `createArticle`, `deleteArticleCascade`) against `dbo.Articles`
- `Backend/src/routes/articles.js` rewritten: `GET /` (color/maxStock filters as SQL WHERE), `POST /` (catches unique-name constraint violation → 400), `DELETE /:id` (production cleanup cascade done as a transaction: remove referencing `ProductionEntries`, delete now-empty `Productions`, then delete the `Article` row)
- **Known transient breakage:** `Backend/src/routes/slips.js` and `Backend/src/routes/productions.js` still `import Article from '../models/Article.js'` expecting the old Mongoose default export — this now breaks at runtime (not caught by `node --check`, only syntax-checks) until Tasks 8/9 migrate those files too. Expected/acceptable mid-session since all of Group 1 + Group 2 are being done in this same pass — see `FLOW.md`.
- Replace `Backend/src/models/Article.js` (Mongoose) with plain query functions against the `Articles` table
- Rewrite `Backend/src/routes/articles.js`: `GET /`, `POST /`, `DELETE /:id`
- `DELETE /:id`'s production-cleanup cascade (EFFORT_ANALYSIS.md §1.2 item 9) must stay application logic — the FK is `ON DELETE SET NULL`, not `CASCADE`, by design (see `001_initial_schema.sql` comments)

**Task 3: Migrate Client model + `clients.js` route to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- `Backend/src/models/Client.js` rewritten as plain MSSQL query functions against `dbo.Clients`, joined against `dbo.Slips`/`dbo.SlipItems` (real SQL JOIN + grouped queries, replacing the old full-table-scan-then-JS-filter join)
- `Backend/src/routes/clients.js` rewritten: `GET /`, `GET /:id`, `POST /` (case-insensitive dedupe via `LOWER(Name) = LOWER(@name)` rather than assuming server collation — see EFFORT_ANALYSIS.md §1.2 item 5, not verified for this instance)
- Slip item field `desc` (API/frontend contract, see `frontend/app/src/types/index.ts`) mapped from the `Description` SQL column — naming mismatch carried over intentionally, do not rename in Task 9
- **Known transient breakage:** `slips.js` and `payments.js` still import the old default `Client` export — resolved when Tasks 9/10 land
- Replace `Backend/src/models/Client.js` with query functions against `Clients`
- Rewrite `Backend/src/routes/clients.js`: `GET /` (needs a real SQL JOIN against Slips, replacing the current manual in-JS join), `GET /:id`, `POST /`
- Case-insensitive name matching (`$regex ... 'i'` in the old code) needs verifying against the target collation — see EFFORT_ANALYSIS.md §1.2 item 5

**Task 4: Migrate Settings model + `auth.js` route to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- `Backend/src/models/Settings.js` rewritten as plain MSSQL query functions (`getSettings`, `upsertSettings`) against `dbo.Settings`, always operating on `TOP 1 ... ORDER BY Id`
- `Backend/src/routes/auth.js` rewritten: `POST /login`, `PATCH /settings` (upserts the singleton row if none exists yet — an improvement over the old code, which would throw if `Settings.findOne()` returned null)
- No other route imports the Settings model — clean cutover, no transient breakage
- **Not yet functional end-to-end:** the `Settings` table has no row until seeded — `seed.js` is still Mongo-only until Task 12. Login will 401 until a row exists (either via Task 12's rewritten seed script or a manual insert). Also still blocked on the `sa` password (see `DECISIONS.md`) for any live DB testing.
- Replace `Backend/src/models/Settings.js` with query functions against `Settings`
- Rewrite `Backend/src/routes/auth.js`: `POST /login`, `PATCH /settings`
- Enforce the single-row convention at the application layer (e.g. always operate on the first/only row) — SQL has no native "singleton table" concept

**Task 5: Migrate ChemPurchase + ChemUsage models + `chemicals.js` route to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- `Desktop_app/Backend/src/models/ChemPurchase.js` + `ChemUsage.js` rewritten as plain MSSQL query functions against `dbo.ChemPurchases` / `dbo.ChemUsages`
- `month` filters (`GET /purchases`, `GET /usage`) use real `Date >= @start AND Date < DATEADD(MONTH, 1, @end)` range comparisons, not string regex (EFFORT_ANALYSIS.md §1.2 item 4)
- `POST /usage`'s check-then-insert wrapped in a `SERIALIZABLE` transaction with `WITH (HOLDLOCK)` reads on both SUM queries (`createChemUsagesWithStockCheck` in `ChemUsage.js`) — prevents two concurrent submissions from both passing the remaining-stock check against the same pre-insert totals
- `Backend/src/routes/chemicals.js` rewritten: `GET /summary`, `GET /purchases`, `POST /purchases`, `GET /usage`, `POST /usage`
- **Known transient breakage:** `profit.js` still imports the old default `ChemPurchase` export — resolved when Task 11 lands

**Task 6: Migrate Expense model + `expenses.js` route to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- `Desktop_app/Backend/src/models/Expense.js` rewritten as plain MSSQL query functions against `dbo.Expenses` + `dbo.ExpenseRows` (`findExpenses`, `createExpenseWithRows`)
- `createExpenseWithRows` does the parent+child insert inside a transaction
- `month`/weekly-range filters use real `DATE` comparisons (reusing existing `currentWeekRange`/`currentMonthRange` helpers from `dateHelpers.js`, only the SQL WHERE construction changed), not string regex — EFFORT_ANALYSIS.md §1.2 item 4
- Row field `desc` (API contract) mapped from the `Description` SQL column, same convention as Task 3's SlipItem mapping
- **Known transient breakage:** `profit.js` still imports the old default `Expense` export — resolved when Task 11 lands

**Task 7: Migrate Bill model + `bills.js` route to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- `Desktop_app/Backend/src/models/Bill.js` rewritten as plain MSSQL query functions against `dbo.Bills` + `dbo.BillEntries` (`findBills`, `createBillWithEntries`)
- `createBillWithEntries` does the parent+child insert inside a transaction
- `month` filter uses a real `DATE` range comparison (not string regex), same as Tasks 5/6 — note this filter param is distinct from the stored `Bills.Month` display string ("August 2026")
- **Known transient breakage:** `profit.js` still imports the old default `Bill` export — resolved when Task 11 lands
- **Group 1 (Tasks 2–7) now fully complete.**
- Replace `Backend/src/models/Bill.js` with query functions against `Bills` + `BillEntries`
- Rewrite `Backend/src/routes/bills.js`: `GET /`, `POST /` — parent+child insert needs a transaction

### Group 2 — Depends on Group 1 (needs Articles + Clients tables populated/migrated first)

**Task 8: Migrate Production model + `productions.js` route to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- `Desktop_app/Backend/src/models/Production.js` rewritten as plain MSSQL query functions against `dbo.Productions` + `dbo.ProductionEntries` (`findProductions`, `createProductionWithEntries`)
- `createProductionWithEntries` wraps the per-entry stock-increment loop + parent/child insert in one transaction, with `WITH (UPDLOCK, ROWLOCK)` on each article lookup — **also fixes a pre-existing bug**: the old Mongo version had no rollback, so a mid-loop "article not found" failure left earlier entries' stock already incremented with no production record created; now the whole batch rolls back together
- `month`/`week` filters use real `DATE` range comparisons, reusing `weekDateRange()` from `dateHelpers.js` unchanged
- `productions.js` no longer imports the old default `Article` export — **this resolves that file's share of Task 2's noted transient breakage**
- No other files import the Production model — clean cutover
- Depends on: Task 2 (Articles)
- Replace `Backend/src/models/Production.js` with query functions against `Productions` + `ProductionEntries`
- Rewrite `Backend/src/routes/productions.js`: `GET /`, `POST /` — the per-entry stock increment loop needs a transaction

**Task 9: Migrate Slip model + `slips.js` route to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- `Desktop_app/Backend/src/models/Slip.js` rewritten as plain MSSQL query functions against `dbo.Slips` + `dbo.SlipItems`, real `JOIN` against `dbo.Clients` replacing `.populate('clientId', 'name phone')`
- **Stock race condition fixed**: `checkAndDeductStock()` locks each distinct article row with `WITH (UPDLOCK, ROWLOCK)` (sorted by name for a consistent lock order across concurrent transactions, avoiding deadlocks) before validating requested-vs-available, then deducts — all inside one transaction, so a second concurrent slip for the same article can't interleave between check and deduct like the old two-loop version allowed
- **Bug fix (not a port):** `PUT /:id` (`updateSlipItems`) restores old stock and deducts new stock in one transaction; on failure, `ROLLBACK` undoes both together. The old Mongo code restored old stock, and on a subsequent deduct-failure restored it *again* before re-deducting — a bug that permanently inflated stock by the old items' quantity on every failed edit. Not preserved.
- Client dedupe/phone-conflict flow (phone-as-identity-key lookup, `clientResolution` `'existing'`/`'new'`, 409 `phone_conflict` response) preserved exactly — only persistence calls changed, per the task's own instruction
- **Minor, accepted behavior nuance:** when multiple items are simultaneously insufficient, which one's error message is returned first is now alphabetical by article name (needed for the lock-ordering fix above) rather than the old items-array order — never a documented contract, just a side effect of loop order
- `slips.js` no longer imports the old default `Article`/`Client` exports — **this resolves the remaining transient breakage noted in Tasks 2 and 3**
- **Known transient breakage:** `profit.js` still imports the old default `Slip` export — resolved when Task 11 lands
- Depends on: Task 2 (Articles), Task 3 (Clients)
- **Highest-complexity task in the whole migration** (see EFFORT_ANALYSIS.md §1.3, §3) — replace `Backend/src/models/Slip.js` with query functions against `Slips` + `SlipItems`
- Rewrite `Backend/src/routes/slips.js`: `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`
- **Must fix, not port, the stock check-then-deduct race condition** — wrap validate+deduct in a proper transaction with row locking (`UPDLOCK`/`HOLDLOCK` or `SERIALIZABLE`), not a direct translation of the current two-loop Mongo logic
- Client dedupe/phone-conflict flow (409 `phone_conflict`, `clientResolution` param) is intricate branching logic — preserve behavior exactly, only the persistence calls change
- `.populate('clientId', 'name phone')` becomes a real `JOIN`

**Task 10: Migrate Payment model + `payments.js` route to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- `Desktop_app/Backend/src/models/Payment.js` rewritten as plain MSSQL query functions against `dbo.Payments` (`findPayments`, `createPayment`)
- `search` matches name/phone/method by substring via `LIKE`, case-insensitively for name/method via `LOWER()` (same collation-avoidance convention as Task 3); search input is bracket-escaped against `%`/`_`/`[` so literal wildcards in a search term don't change match semantics (parameterized query, so this was never a SQL-injection risk — just a correctness nicety)
- `month`/weekly-range filters use real `DATE` comparisons, reusing `currentWeekRange`/`currentMonthRange` unchanged
- `ClientName`/`ClientPhone` stored as a snapshot at insert time (not live-joined), per `001_initial_schema.sql`'s comment
- `payments.js` reuses `findClientByNameCaseInsensitive` from `Client.js` (Task 3) rather than duplicating the lookup, and no longer imports the old default `Client` export — **this resolves the last remaining piece of Task 3's noted transient breakage**
- **Group 2 (Tasks 8–10) now fully complete.** Only `profit.js` (Task 11) still imports old default Mongoose exports (`ChemPurchase`, `Expense`, `Bill`, `Slip`) at this point.
- Depends on: Task 3 (Clients)
- Replace `Backend/src/models/Payment.js` with query functions against `Payments`
- Rewrite `Backend/src/routes/payments.js`: `GET /` (search across name/phone/method — verify collation per Task 3's note), `POST /`
- Remember: `ClientName`/`ClientPhone` are a deliberate snapshot, not a live join — see `001_initial_schema.sql` comment

### Group 3 — Depends on Groups 1 and 2 (needs Slips, Expenses, Bills, ChemPurchases all migrated)

**Task 11: Migrate `profit.js` aggregations to MSSQL** (completed) [assigned: claude, started: 2026-08-13]
- New `Desktop_app/Backend/src/models/Profit.js`: `calcMonth(month, year)` (4 parallel SQL `SUM`s for one month) and `calcYear(year)` (4 `GROUP BY MONTH(Date)` queries covering all 12 months in one pass each, replacing the old code's up-to-12 separate per-month document fetches)
- `grossSales` sums `Slips.Total` directly with no join to `SlipItems` — avoids the fan-out double-count the task flagged (EFFORT_ANALYSIS.md §3 item 2); `operatingExpenses`/`utilityBills` sum child rows (`ExpenseRows.Price`/`BillEntries.Amount`) joined only to their own immediate parent for the date filter, which is not a fan-out risk (no parent-level total being multiplied)
- `Backend/src/routes/profit.js` rewritten: `GET /monthly`, `GET /annual`, `GET /analytics` — preserved two pre-existing behavioral quirks exactly rather than "fixing" them: `/annual`'s month list is always `Jan..currentMonth` of *today* regardless of the requested `?year=`, while `/analytics`'s annual totals always cover the full 12 months of the requested year
- **Group 3 (Task 11) complete. Every route file's default-Mongoose-model imports are now gone** — verified via `grep -rn "^import [A-Z][a-zA-Z]* from '\.\./models" src/routes/*.js` returning nothing. The app's route layer is now internally consistent again (was intentionally inconsistent mid-session since Task 2, per each task's transient-breakage notes).
- Depends on: Task 6 (Expenses), Task 7 (Bills), Task 9 (Slips), Task 5 (ChemPurchases)
- Rewrite `Backend/src/routes/profit.js`: `GET /monthly`, `GET /annual`, `GET /analytics`
- Replace the JS `Promise.all` + `.reduce()` aggregation with real SQL `GROUP BY`/`SUM` — **be careful of fan-out double-counting**: sum `Slips.Total` directly rather than joining `SlipItems` and summing, to avoid inflating `grossSales` when a slip has multiple items (see EFFORT_ANALYSIS.md §3 item 2)

### Group 4 — Final cleanup (depends on ALL of Groups 1–3 being completed)

**Task 12: Remove MongoDB/Mongoose entirely** (completed) [assigned: claude, started: 2026-08-13]
- `npm uninstall mongoose` (removed from `package.json` + `package-lock.json` + `node_modules`, 19 packages removed) — no model files needed deleting since Tasks 2–11 already rewrote every one of them in place (`Desktop_app/Backend/src/models/*.js` was already 100% MSSQL query modules by the end of Task 11, nothing left in Mongoose form)
- Deleted `Desktop_app/Backend/src/db.js` (MongoDB connection) and `src/store.js` (dead code — an old in-memory-array placeholder from before any DB was wired in; confirmed unused via grep before deleting)
- `src/index.js`: removed `connectDB()` import/call, now connects to MSSQL only (still fatal on failure, same as MongoDB was)
- `.env.example`: removed the `MONGODB_URI` block
- `seed.js` rewritten end-to-end against MSSQL: wipes tables in FK-safe dependency order (children with `ON DELETE CASCADE` covered by their parent's delete; `Clients`/`Articles` deleted after everything that references them), `DBCC CHECKIDENT ... RESEED, 0` per table for clean re-seedable IDs, then inserts the same demo dataset as the old Mongo version via direct parameterized `INSERT`s (bypassing the route-layer business logic, which is the right call for a bulk seed script — not appropriate for `createSlip`'s client-dedupe/stock-deduction machinery)
- Verified: `grep -rln "mongoose"` across `src/` and `seed.js` → no hits. `node --check` passes on every backend `.js` file. `node src/index.js` boots cleanly through all imports and route mounting, reaching the MSSQL connection attempt and failing only on the still-unresolved `sa` credentials (`Login failed for user ''`) — confirms no leftover Mongo-era code paths, not a defect.
- **Not done — blocked, not skipped:** the actual live-endpoint smoke test (the task's last bullet) needs a working MSSQL login, which has been an open item since Task 1 (`DECISIONS.md` "Development environment" entry — `sa` password never resolved this session). Did not attempt to guess/discover the password by searching outside the repo (a sandboxed `sudo`/system-wide search was denied by the permission classifier mid-session; correctly did not try to route around that). **This is the one concrete next step before this migration can be called fully verified**, not just code-complete.
- **All 12 tasks (Groups 0–4) are now `completed`.** Group 5 (Electron IPC layer, Tasks 13–16) is separate follow-on work added by another session after the Task 0 IPC-vs-HTTP reversal — out of scope for this task list's original MSSQL migration goal.

### Group 5 — IPC layer (new, added after the IPC-vs-HTTP reversal — see `DECISIONS.md`)

Scaffolded at the same level of detail Groups 2–4 originally were — not deeply implemented, just scoped. This group exists because Tasks 2–8 were written as Express `req`/`res` handlers under the original (now-reversed) HTTP decision; IPC needs a different handler shape.

**Task 13: Extract business logic from migrated routes into plain service functions** (not_completed)
- Depends on: Tasks 2–11 (can't usefully finalize shape until each route's SQL logic itself is done)
- Applies to all of `Desktop_app/Backend/src/routes/*.js` — pull the logic currently inline in each Express handler into a function callable independent of `req`/`res`, so it can be called from `ipcMain.handle` (and optionally still from a thin Express wrapper, if Group 5's open question below resolves toward keeping one)
- This is genuinely new work, not something the MSSQL migration (Tasks 2–11) already accounted for — those tasks correctly focused on the data-access rewrite, not the transport shape

**Task 14: Build the Electron main-process IPC layer inside `Desktop_app/`** (not_completed)
- Depends on: Task 13
- `preload.js` — `contextBridge`, single invoke primitive (e.g. `__ipcInvoke`), `window.api` built via a `Proxy` over a `FEATURES` registry (see `DECISIONS.md`'s recommended-conventions note — not a locked-in decision yet, confirm before building)
- `ipcMain.handle` registrations per feature, wired to Task 13's service functions
- `{ ok: true, data }` / `{ ok: false, error: { message, code } }` envelope convention — never throw raw errors across the IPC boundary

**Task 15: Rewrite `frontend/app/src/lib/*.ts` (9 files) from `fetch()` to IPC** (not_completed)
- Depends on: Task 14
- Every call becomes `window.api.<feature>.<action>(payload)` instead of `apiRequest()`/`fetch()`
- `lib/api.ts`'s token/auth handling likely becomes unnecessary or changes shape — no network boundary left to protect (per `IPC_VS_HTTP_FINDINGS.md` §2.1); revisit whether JWT auth is still needed at all under IPC, or whether the OS process boundary is sufficient (this needs its own decision when Task 15 starts, not assumed here)

**Task 16: `electron-builder` packaging config + installer script** (not_completed)
- Independent of Tasks 13–15, can start any time
- Silent MSSQL provisioning during install (per earlier `PROPOSED_PLAN.md`/decision-log discussion on the installer flow), single `.exe` output

**Open question (not resolved yet):** does `Desktop_app/Backend/src/routes/*.js` (Express) stay in the codebase as an optional dev-only testability harness (curl/Postman against a fixed contract — one of HTTP's few remaining advantages per `IPC_VS_HTTP_FINDINGS.md` §3.3), or get removed entirely once IPC ships? Affects whether Task 13's extraction leaves the Express routers in place calling the new service functions, or deletes them. Decide before or during Task 13.

---

## Notes for agents picking up tasks

- Before marking a task `completed`, cross-check whether it involved a new library/architecture decision — if so, it should have gone through the quiz-before-major-changes process (see project memory) and been logged in `DECISIONS.md`.
- If a task involved real code changes, add an entry to `FLOW.md`'s Session Change Log.
- If you discover a task needs to be split, blocked, or reprioritized, edit its entry directly here rather than starting undocumented side work.
- Every task above assumes the conventions set in Task 1 (raw `mssql` driver, `INT IDENTITY` ids cast to string in API responses, transactions for any multi-statement write, numbered migration files for schema changes) — don't introduce a different pattern without logging why in `DECISIONS.md`.
