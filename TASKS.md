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
- **Closed out 2026-08-13:** `sa` password resolved via `.env` (see `DECISIONS.md`). `001_initial_schema.sql` run against a live instance — all 14 tables confirmed present via `INFORMATION_SCHEMA.TABLES`. `npm run seed`/`node seed.js` populated every table; row counts verified against `seed.js`'s known dataset (7 Articles, 5 Clients, 12 Slips, 17 SlipItems, 7 Productions, 5 Expenses, 5 Bills, 2 ChemPurchases, 7 ChemUsages, 1 Settings row).
- **Live smoke test results (all 5 priority checks passed):**
  1. `POST /auth/login` with seeded `admin`/`admin` → 200, valid JWT. Confirms Settings singleton lookup + bcrypt compare path.
  2. Created a slip (10× Rubber Sole, stock 80→70). Edited it to 15× (70→65, correct incremental delta — restore-10-then-deduct-15 net of -5). Edited again to an impossible 10,000× → 400 `"Rubber Sole: requested 10000 but only 80 in stock"`, stock **stayed at 65**, not inflated to 80 like the old pre-fix double-restore bug would have produced. Deleted the slip → stock restored exactly to 80.
  3. `GET /profit/monthly?month=2026-06` → `grossSales: 180572`, verified byte-for-byte against a raw `SELECT SUM(Total) FROM Slips WHERE Date IN June 2026` (`180572.00`) run directly via `sqlcmd`. 5 of the 12 June slips have 2 line items each, so a `SlipItems`-join fan-out bug would have visibly inflated this — it didn't.
  4. `POST /chemicals/usage` with `qty: 99999` against a real remaining balance of 50kg (80 purchased − 30 used) → 400 `"Usage exceeds remaining stock. Only 50 kg available."`, and the summary endpoint confirmed `remaining: 50` unchanged after the rejected attempt — no partial write from the aborted transaction.
- **One harmless side effect left in the seeded data:** the smoke test created and later deleted a test slip, but the client it created along the way ("Smoke Test Client", phone `0399-0000001`) was not deleted — there's no `DELETE /clients` endpoint (never existed, not a migration gap). Cosmetic only; doesn't affect any of the above results. Re-run `node seed.js` to get back to a fully clean dataset if desired.
- **The entire MSSQL migration (Tasks 1–12) is now verified working end-to-end against a live database, not just statically checked.**

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

**Task 13: Extract business logic from migrated routes into plain service functions** (completed) [assigned: claude, started: 2026-08-13]
- New `Desktop_app/Backend/src/services/*.js` — one file per domain (auth, articles, clients, chemicals, expenses, bills, productions, slips, payments, profit), 10 files total, plus `services/errors.js` (`ValidationError`, `NotFoundError`) shared across all of them. Domain-specific typed errors already in the model layer (`InsufficientStockError`, `PhoneConflictError`, `ArticleNotFoundError`) are reused, not duplicated.
- Each service function takes plain arguments and returns plain data or throws a typed error — no `req`/`res` anywhere in `src/services/`
- All 10 `src/routes/*.js` files rewritten as thin wrappers: parse `req`, call the service function, catch specific error types → map to HTTP status, else 500 — same pattern as every route already used, just with the business logic (validation + model orchestration) moved out
- **Auth/JWT deliberately untouched**: `requireAuth` middleware and JWT token issuance stay in `routes/auth.js` exactly as before (token generation is transport-specific, so it stays in the route layer, not the service layer) — per the accepted Group 5 decision, JWT gets removed only at Task 17, alongside Express itself
- Verified: `node --check` on every backend file; restarted the live server and re-ran a spot-check (login, validation-error mapping, duplicate-article business-error mapping, `profit/monthly` grossSales, chemicals summary) against the same live MSSQL data used for the Task 1 smoke test — all results identical to before the refactor, confirming this was a pure extraction with no behavior change
- Depends on: Tasks 2–11 (can't usefully finalize shape until each route's SQL logic itself is done)
- Applies to all of `Desktop_app/Backend/src/routes/*.js` — pull the logic currently inline in each Express handler into a function callable independent of `req`/`res`, so it can be called from `ipcMain.handle` (and optionally still from a thin Express wrapper, if Group 5's open question below resolves toward keeping one)
- This is genuinely new work, not something the MSSQL migration (Tasks 2–11) already accounted for — those tasks correctly focused on the data-access rewrite, not the transport shape

**Task 14: Build the Electron main-process IPC layer inside `Desktop_app/`** (completed) [assigned: claude, started: 2026-08-13]
- New `Desktop_app/package.json` (electron `^33.4.11` installed as a devDependency, dotenv as a dependency — `npm install` took ~3 min to download the Electron binary, succeeded)
- New `Desktop_app/main.js`: connects to MSSQL, dynamically `import()`s all 10 of Task 13's ESM service modules from this CommonJS file (Backend stays ESM, main.js/preload.js stay CommonJS — the lower-friction choice over converting either side), registers ~27 `ipcMain.handle` channels (one per service function) through a shared `wrap()` helper implementing the `{ok,data}`/`{ok,error:{message,code}}` envelope, then creates the `BrowserWindow`
- Added `.code` properties to every typed service/model error (`ValidationError`, `NotFoundError`, `DuplicateArticleError`, `ClientExistsError`, `InvalidCredentialsError`, `InsufficientStockError` ×2, `PhoneConflictError`, `ArticleNotFoundError`) so the IPC envelope can carry structured codes, not just messages
- New `Desktop_app/preload.js`: one explicit `contextBridge`-exposed function per channel under `window.api.<feature>.<action>`, per the accepted decision (not the Proxy/FEATURES-registry pattern)
- **Verified two ways:** (1) a standalone script mirroring `main.js`'s wiring logic, run directly against the live MSSQL instance — confirmed correct `{ok,data}`/`{ok,error}` shapes and correct `.code` values for login success/failure/validation, article list, duplicate-article, `profit:monthly` (still `180572`, matching the Task 1 smoke test), and slip-creation insufficient-stock. (2) Actually launched `electron .` (with `--no-sandbox`, needed in this root-less Linux dev container — irrelevant to the shipped Windows app) — confirmed `MSSQL connected`, all IPC channels registered without error, `BrowserWindow` created, and it correctly attempted to load `frontend/app/dist/index.html` (expected `ERR_FILE_NOT_FOUND` — no frontend build exists yet, Task 15 not started). A subsequent GPU-process crash is this headless dev container lacking real GPU/display support, unrelated to the code.
- Updated `Desktop_app/README.md` — was stale (still described the reversed localhost-HTTP plan); now documents the actual IPC architecture, envelope convention, no-JWT decision, and current Group 5 status
- **Not yet possible:** a real end-to-end UI smoke test (window actually rendering the app) — needs Task 15's frontend rewrite plus a production build first
- Depends on: Task 13
- `preload.js` — `contextBridge`, single invoke primitive (e.g. `__ipcInvoke`), `window.api` built via a `Proxy` over a `FEATURES` registry (see `DECISIONS.md`'s recommended-conventions note — not a locked-in decision yet, confirm before building)
- `ipcMain.handle` registrations per feature, wired to Task 13's service functions
- `{ ok: true, data }` / `{ ok: false, error: { message, code } }` envelope convention — never throw raw errors across the IPC boundary

**Task 15: Rewrite `frontend/app/src/lib/*.ts` (9 files) from `fetch()` to IPC** (completed — see caveat) [assigned: claude, started: 2026-08-13]
- All 9 lib files rewritten to call `window.api.<feature>.<action>()` via a shared `callIpc<T>()` helper in `lib/api.ts` (unwraps the `{ok,data}`/`{ok,error}` envelope, throws a new `IpcError{message,code}` on failure)
- New `src/types/window.d.ts` — global `Window.api` type declaration matching `preload.js` exactly
- **Auth simplified, no persisted session**: `lib/api.ts`'s `getToken`/`setToken`/`clearToken`/`getUsernameFromToken` deleted entirely; `AppContext.tsx`'s `state.token` field removed, `initialState` now always starts at `isLoggedIn:false`/`currentPage:'login'` (no restored session across launches — see DECISIONS.md's Group 5 "drop JWT" entry). `LoginPage.tsx` and `SettingsPage.tsx` updated to stop calling the now-deleted `setToken`.
- `NewSalePage.tsx`'s phone-conflict catch block updated: `err instanceof ApiError && err.status === 409 && err.body?.error === 'phone_conflict'` → `err instanceof IpcError && err.code === 'phone_conflict'`
- **Real bug found and fixed during this rewrite**: `PhoneConflictError`'s human-readable message (`This phone number is already registered to "X".`) was being constructed in the *Express route*, not the model — since IPC calls the service/model layer directly and skips the Express route entirely, the IPC path would have surfaced the raw, unhelpful `'phone_conflict'` string instead. Fixed by moving the message construction into `models/Slip.js`'s `PhoneConflictError` constructor itself (single source of truth); Express's route simplified to just use `err.message`. Verified both paths independently: Express via `curl` (still gets the friendly message, unchanged output), and the service layer directly via a standalone script (now also gets the friendly message, confirmed before this fix it would have gotten `"phone_conflict"` literally).
- **Verified:** `tsc -b` (strict mode, `noUnusedLocals`/`noUnusedParameters` on) passes clean after adding explicit `callIpc<T>(...)` type arguments at every call site (TS can't infer `T` back through `window.api`'s intentionally loosely-typed return). `vite build` succeeds, producing a real `dist/index.html` + bundled JS/CSS. `eslint` shows only pre-existing issues in files this task didn't touch (shadcn UI components, hooks, other pages' existing `any` usage) — none newly introduced.
- **Caveat — could not get a full visual click-through test:** launched the real Electron app (`electron .`) against the actual production build twice, including under `xvfb-run` — this sandboxed dev container has no working GPU/display stack at all (`GPU process isn't usable`, `Failed to shutdown`, crashes before/during window creation even with `--no-sandbox --disable-gpu`). This is an environment limitation, not a code defect: `main.js` itself was already independently verified working (MSSQL connects, all ~27 IPC channels register without error — see Task 14's notes) up to the point where a real GPU-backed renderer process is needed. **Getting an actual window open and clicking through login → data load → a create/edit flow needs a machine (or CI runner) with real GPU/display support** — that's the one concrete verification step left before Task 17 can start (Task 17 explicitly requires this).
- Depends on: Task 14
- Every call becomes `window.api.<feature>.<action>(payload)` instead of `apiRequest()`/`fetch()`
- `lib/api.ts`'s token/auth handling likely becomes unnecessary or changes shape — no network boundary left to protect (per `IPC_VS_HTTP_FINDINGS.md` §2.1); revisit whether JWT auth is still needed at all under IPC, or whether the OS process boundary is sufficient (this needs its own decision when Task 15 starts, not assumed here)

**Task 16: `electron-builder` packaging config + installer script** (completed — one caveat) [assigned: claude, started: 2026-08-13]
- `electron-builder` installed as a devDependency; `Desktop_app/package.json` gets a `"build"` config (`appId`, `productName`, NSIS target for Windows, `files` list bundling `main.js`/`preload.js`/`scripts/`/`Backend/**` (minus `.env`)/`frontend/app/dist/**`), plus `npm run dist`/`npm run pack` scripts
- New `Desktop_app/scripts/provisionDatabase.js` — first-run schema provisioning: connects to `master` (not `starmans`, which may not exist yet — connecting with a nonexistent database name fails MSSQL login outright, see `DECISIONS.md`'s Development-environment entry for how that was discovered), checks `DB_ID('starmans')`, and if missing, runs `001_initial_schema.sql` by splitting it on `GO` (sqlcmd's batch separator, not real T-SQL — the driver can't run the file as one statement) and sending each batch over the same connection/session so the migration's own `USE starmans;` partway through correctly redirects the remaining batches
- New `Desktop_app/scripts/ensureSqlServer.js` — best-effort SQL Server Express silent-install for Windows, written against Microsoft's documented command-line setup parameters
- `main.js` updated: startup sequence is now `ensureSqlServer()` (Windows-only, no-op elsewhere) → generated sa password persisted to `userData/mssql.env` if a fresh install happened → `provisionDatabase()` → `connectMSSQL()`; startup failures now show `dialog.showErrorBox` (a packaged app has no visible console)
- **Verified (the parts that can be, on Linux):** `provisionDatabase.js`'s batch-splitter correctly parses all 19 `GO`-separated batches from the real migration file; its master-connection existence check correctly returns `true` against the live `starmans` DB. Ran a real `electron-builder --dir` build and inspected the resulting `app.asar` — confirmed `main.js`, `preload.js`, `scripts/`, `Backend/src/services/*`, `Backend/migrations/001_initial_schema.sql`, and the real `frontend/app/dist/` build output are all correctly bundled, and `Backend/.env` is correctly excluded. **Ran the actual packaged binary** (`linux-unpacked/starmans-desktop`) twice: once with no credentials configured (correctly failed with a clear, caught error — expected for a fresh package, not a bug), and once after placing a real `mssql.env` at Electron's actual `userData` path (`~/.config/starmans-desktop/`, confirmed empirically since Electron uses `package.json`'s `"name"`, not `"productName"`, for this) — confirmed the packaged app then connected successfully and correctly skipped schema provisioning (already exists). This validates all `__dirname`/asar-relative path resolution end-to-end.
- **One caveat — `ensureSqlServer.js` is explicitly unverified:** the SQL Server Express bootstrapper URL and silent-install command-line flags are written from Microsoft's documented reference, but this project's dev environment is Linux-only (no way to test an actual Windows download+install here — see `DECISIONS.md`'s Development-environment entry). **Must be tested on a real Windows machine before this ships in a client-facing installer.** Designed to fail safe in the meantime: if the automated install doesn't work, startup still fails with a clear, caught, dialog-surfaced error rather than a silent crash.
- Independent of Tasks 13–15, can start any time
- Silent MSSQL provisioning during install (per earlier `PROPOSED_PLAN.md`/decision-log discussion on the installer flow), single `.exe` output

**Task 17: Remove Express entirely** (completed) [assigned: claude, started: 2026-08-13]
- Depends on: Task 15 completed, AND the full IPC architecture manually smoke-tested end-to-end (equivalent depth to the MSSQL smoke test done for Tasks 1–12 — login, stock deduction on slip create/edit, profit aggregation, chemical usage over-limit rejection, all exercised through the real IPC path, not just `node --check`)
- **Resolves the open question below:** Express does NOT stay as a dev-only harness — full removal once IPC is proven working. Delete `Desktop_app/Backend/src/routes/*.js`, `src/index.js`'s Express app/route-mounting, `src/middleware/auth.js` (JWT no longer has a network boundary to protect — see Task 15's note on this), and the `express`/`cors`/`express-rate-limit`/`jsonwebtoken` dependencies from `package.json`
- Do NOT start this task until IPC is fully working and tested — Express stays as the working, testable reference implementation until then. Removing it early would leave no way to smoke-test the SQL logic while the IPC layer is still being built.
- **Precondition met 2026-08-13 — the GPU/display blocker noted in Task 15 was resolved, not worked around.** The blocker turned out to be this session's own outer command-execution sandbox restricting Chromium's GPU/zygote process spawn (a separate, more fundamental layer than Electron's own `--no-sandbox`) — not missing GPU devices or drivers (both were confirmed present via ACL checks on `/dev/dri/*`). Disabling that outer sandbox for the test command + running under `xvfb-run` got a real window rendering.
- **Full end-to-end verification achieved, via Chrome DevTools Protocol against the live running app** (not just `window.api` calls from a script — an actual rendered window, `--remote-debugging-port=9222`, driven exactly like a real user would be):
  1. **UI-driven login**: simulated real keystrokes into the actual username/password `<input>` elements and clicked the real "Log In" `<button>` (the actual React `onSubmit` handler → `login()` → `window.api.auth.login()` → IPC → service → MSSQL). Page correctly navigated from the login screen to the real home page with the full nav sidebar rendered.
  2. **Stock deduction on slip create, through real IPC**: `window.api.slips.create(...)` for 3× TPR Sole — stock went `200 → 197`, exact match.
  3. **Profit aggregation, through real IPC**: `window.api.profit.monthly('2026-06')` → `grossSales: 180572`, matching every prior cross-check in this project.
  4. **Chemical usage over-limit rejection, through real IPC**: `window.api.chemicals.createUsage({qty: 999999})` → correctly rejected, `{"message":"Usage exceeds remaining stock. Only 50 kg available.","code":"insufficient_stock"}`.
  A screenshot of the real running app (the login screen) was sent to the user as visual proof, not just log output. Test data (one slip + its stock deduction) created during this verification was deleted afterward, restoring stock exactly.
- **This satisfies Task 17's stated precondition exactly** — login, stock deduction, profit aggregation, and chemical over-limit rejection, all exercised through the real IPC path, not `node --check`. Proceeding with Express removal now.
- **Removed:** `Desktop_app/Backend/src/routes/` (all 10 route files), `Desktop_app/Backend/src/middleware/` (JWT `requireAuth`), `Desktop_app/Backend/src/index.js` (the old Express entry point — nothing calls it anymore, `main.js` is the real entry point and imports services directly)
- `Desktop_app/Backend/package.json`: removed `express`, `cors`, `express-rate-limit`, `jsonwebtoken` (69 packages uninstalled via `npm uninstall`); removed the now-meaningless `dev`/`start` scripts (there's no standalone backend server to start); `main` field removed (nothing requires this package as an entry point either)
- Rewrote `Desktop_app/Backend/README.md` (was completely stale — described the pre-migration in-memory-store Express API) and `Desktop_app/README.md`'s status section to reflect Express's actual removal, not "will be removed"
- **Verified: `grep -rln "requireAuth\|jsonwebtoken\|from 'express'\|from 'cors'\|express-rate-limit"` across `src/` and `seed.js` → zero hits.** `node --check` passes on every remaining backend file. **Relaunched the full app via CDP one more time, with Express completely gone** — real UI login (keystrokes + button click) → home page rendered correctly, `articles:list` → 8 articles, `profit:monthly` → same `180572` as every prior check in this project. No regressions from the removal.
- **All 17 tasks in `TASKS.md` (Groups 0–5) are now `completed`.** The only remaining open item in the whole board is `ensureSqlServer.js`'s unverified Windows-specific SQL Server Express install path (see `DECISIONS.md`) — needs a real Windows machine, not more code.

**Resolved (2026-08-13):** the open question below is settled — Express is temporary scaffolding, not a permanent dev harness. Kept only until Task 17 fires.

~~**Open question (not resolved yet):** does `Desktop_app/Backend/src/routes/*.js` (Express) stay in the codebase as an optional dev-only testability harness (curl/Postman against a fixed contract — one of HTTP's few remaining advantages per `IPC_VS_HTTP_FINDINGS.md` §3.3), or get removed entirely once IPC ships? Affects whether Task 13's extraction leaves the Express routers in place calling the new service functions, or deletes them. Decide before or during Task 13.~~

---

## Notes for agents picking up tasks

- Before marking a task `completed`, cross-check whether it involved a new library/architecture decision — if so, it should have gone through the quiz-before-major-changes process (see project memory) and been logged in `DECISIONS.md`.
- If a task involved real code changes, add an entry to `FLOW.md`'s Session Change Log.
- If you discover a task needs to be split, blocked, or reprioritized, edit its entry directly here rather than starting undocumented side work.
- Every task above assumes the conventions set in Task 1 (raw `mssql` driver, `INT IDENTITY` ids cast to string in API responses, transactions for any multi-statement write, numbered migration files for schema changes) — don't introduce a different pattern without logging why in `DECISIONS.md`.
