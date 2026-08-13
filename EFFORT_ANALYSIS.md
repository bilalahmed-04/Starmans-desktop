# Effort Analysis — MongoDB → MSSQL + Electron Desktop Migration

> Scope: (1) replace MongoDB/Mongoose with MSSQL/SQL Server across `Backend/`, (2) package backend + frontend as a Windows Electron desktop app instead of a browser client-server setup. Based on a full read of every model and route file in `Backend/src/`.

---

## 1. DATABASE MIGRATION SCOPE

### 1.1 Every collection that needs a relational schema redesign

All 10 Mongoose models need a SQL equivalent. None can be a pure syntax swap — every one of them either embeds a document array or uses an ObjectId reference that needs to become a real foreign key.

| Model | Current shape | Relational redesign needed |
|---|---|---|
| **Article** | Flat document | 1 table, `Articles(Id, Name, Price, Stock, Color, Size)`. Simple. |
| **Client** | Flat document | 1 table, `Clients(Id, Name, Phone)`. Simple. Needs an index on `Phone` (was `index: true` in Mongo) and a case-insensitive collation or `LOWER(Name)` index for the name-matching queries. |
| **Slip** | Document with **embedded `items[]` array** (`SlipItemSchema`, 11 fields each) + `clientId` ref | 2 tables: `Slips(Id, No, ClientId FK, Date, Time, Total)` + `SlipItems(Id, SlipId FK, Name, Qty, Price, Subtotal, DiscountType, DiscountAmount, DiscountPct, Amount, Desc, Size, Color)`. Highest-complexity redesign in the schema set — every slip create/update/delete becomes a multi-statement transaction (insert/delete parent + children together). |
| **Production** | Document with **embedded `entries[]` array** | 2 tables: `Productions(Id, Date)` + `ProductionEntries(Id, ProductionId FK, ArticleId FK, ArticleName, Qty)`. Note `articleId` is currently stored as a loose `String`, not a real Mongo ref — should become a proper FK to `Articles.Id`, which raises the question of what happens on article delete (see §1.2). |
| **Expense** | Document with **embedded `rows[]` array** | 2 tables: `Expenses(Id, Date, Time)` + `ExpenseRows(Id, ExpenseId FK, Desc, Price)`. |
| **Bill** | Document with **embedded `entries[]` array** | 2 tables: `Bills(Id, Date, Month)` + `BillEntries(Id, BillId FK, Name, Amount)`. `Month` is a derived/denormalized display string (`"June 2026"`) computed from `date` at insert time — worth keeping as-is for parity, but it's a redundant column a relational purist would drop in favor of computing from `Date` at query time. |
| **ChemPurchase** | Flat document | 1 table, `ChemPurchases(Id, Date, Qty, Cost)`. Simple. |
| **ChemUsage** | Flat document | 1 table, `ChemUsages(Id, Date, Qty)`. Simple. |
| **Payment** | Flat document with `clientId` ref, conditional fields (`collectionDate`/`chequeDate` only set for Cheque method) | 1 table, `Payments(Id, ClientId FK, Date, Time, ClientName, ClientPhone, Method, Amount, Desc, CollectionDate NULL, ChequeDate NULL)`. `ClientName`/`ClientPhone` are **denormalized copies** of the client record at time of payment (intentional snapshot, not a bug) — keep as redundant columns, don't try to "normalize them away" or historical payments will show current client data instead of point-in-time data. |
| **Settings** | Singleton document, "always queried with `findOne()`" | 1 table, `Settings(Id, Username, PasswordHash)` — constrained to exactly one row (e.g. seed a single row with a fixed `Id=1`, or a check constraint). No natural relational concept of "singleton" in SQL, so this needs an app-level or constraint-level convention. |

**Total: 10 Mongo models → roughly 14 SQL tables** (4 of the 10 models split into parent+child pairs).

### 1.2 MongoDB-specific patterns that need real redesign, not just a syntax swap

These are the parts that will actually cost time — genuine schema/logic rework, not `find()` → `SELECT`:

1. **Embedded arrays as first-class documents** (`Slip.items`, `Production.entries`, `Expense.rows`, `Bill.entries`). Mongo lets you write/read the parent + children as one atomic document. In MSSQL every create/update now needs an explicit **transaction** wrapping an insert/delete into a parent table and one-to-many inserts into a child table. This affects `slips.js`, `productions.js`, `expenses.js`, `bills.js` — i.e. most of the write-heavy routes.

2. **`findByIdAndUpdate` with `$inc` for stock** (`articles.js`, `productions.js`, `slips.js`'s `checkAndDeductStock`/`restoreStock`). Mongo's atomic `$inc` becomes `UPDATE Articles SET Stock = Stock - @qty WHERE Id = @id` — fine on its own, but the *current* code has a **check-then-deduct race condition already** (`checkAndDeductStock` reads stock, validates, then deducts in a second loop — two clients selling the last unit simultaneously could both pass validation). In Mongo this was already a soft spot; in MSSQL, doing this correctly means wrapping the check+deduct in a `SERIALIZABLE` or `UPDLOCK`/`HOLDLOCK` transaction, which is new logic, not a copy of the existing bug.

3. **Manual application-side joins.** `clients.js` `GET /` fetches *all* clients and *all* slips separately and does a JS `.filter()` to attach each client's slips (no `$lookup`/populate at the DB level, just an N+1-avoidant in-memory join). This needs to become a real SQL `JOIN` (or two queries + a `GROUP BY`/dictionary merge, but written intentionally rather than as a Mongo workaround). Same pattern in `slips.js` (`.populate('clientId', 'name phone')`) — Mongoose's `populate` has no direct SQL equivalent; every populated read becomes an explicit `JOIN Clients ON ...`.

4. **Regex-based "starts with" date filtering.** Nearly every GET route filters by `date: { $regex: `^${month}` }` because dates are stored as **plain strings** (`'2026-06-15'`), not native date types. This pattern appears in `slips.js`, `productions.js`, `expenses.js`, `bills.js`, `chemicals.js` (both purchases and usage), and `payments.js` — **7 of 9 domain routes**. Recommendation: migrate `date` columns to a real SQL `DATE` type and rewrite these as `WHERE Date >= @start AND Date < @end` (via `DATEFROMPARTS`/computed month boundaries) instead of porting the regex pattern into `LIKE '2026-06%'`, which would work but throws away the point of using a relational DB in the first place.

5. **Case-insensitive regex name/search matching.** `slips.js` (client name match), `clients.js` (`$regex ... 'i'`), `payments.js` (`$or` search across `clientName`, `clientPhone`, `method` with `$options: 'i'`) all rely on Mongo's per-query regex flags. MSSQL default collations are usually already case-insensitive (`_CI_AS`), so this *might* be closer to a direct swap to `LIKE` — but it needs to be verified against whatever collation the target SQL Server instance uses, not assumed.

6. **`Article.findOneAndUpdate({ name }, ...)` keyed by name, not id**, in `slips.js`'s stock helpers. Article lookups here go by `name` string, not `_id` — meaning stock updates depend on article names being unique, which is never enforced anywhere (no `unique: true` on `Article.name` in the schema). This is a **pre-existing data-integrity gap** that should be fixed (add a unique constraint) while doing the relational redesign, not silently carried over.

7. **`insertMany` bulk insert** (`chemicals.js` usage POST, accepts `{ entries: [...] }` or a single object) — straightforward to replace with a multi-row `INSERT` or a loop inside a transaction, but the "single object OR array" duck-typing at the route level should be kept as-is (it's an API contract the frontend relies on, not a Mongo artifact).

8. **`toJSON` transforms stripping `_id`/`__v` and renaming to `id`.** Every single model has this identical boilerplate. In SQL, identity columns are already named `Id`; the frontend types (`src/types/index.ts`) expect lowercase `id` as a string. Decision needed: either keep API responses shaped the same (map `Id` → `id: string(Id)` in every route, preserving the frontend contract with zero frontend changes) or accept a frontend type/lib change. **Recommend keeping the API contract identical** (map on the way out) to avoid touching the frontend at all — this is a backend-only migration if done that way.

9. **Article deletion cascade logic** (`articles.js` `DELETE /:id`): manually finds all `Production` docs referencing the deleted article, strips the matching entry, and deletes the whole `Production` if it becomes empty. In SQL this becomes either an `ON DELETE CASCADE`/`SET NULL` FK constraint (changes cascade semantics silently) or an explicit equivalent transaction (delete child rows, then check for now-orphaned empty parent rows) — the current "delete production entirely if it becomes empty" behavior is a business rule, not a DB mechanic, so it must be re-implemented explicitly rather than delegated to a cascade constraint.

### 1.3 Route-by-route rewrite estimate

| Route file | LOC (approx) | DB-specific vs reusable | Rewrite size |
|---|---|---|---|
| `auth.js` | 69 | Mostly reusable (JWT/bcrypt logic unchanged); only `Settings.findOne()`/`.save()` is Mongo-specific | **Small** |
| `articles.js` | 61 | ~50% DB-specific: simple CRUD is easy, but the production-cleanup cascade (§1.2.9) needs real rework | **Small–Medium** |
| `clients.js` | 56 | ~60% DB-specific: simple CRUD + one manual join that needs to become a real SQL JOIN | **Medium** |
| `slips.js` | 215 | ~70% DB-specific: embedded items array, client dedupe/conflict flow, stock check+deduct across multiple items, `.populate()` reads — the single most complex file in the backend | **Large** |
| `productions.js` | 53 | ~60% DB-specific: embedded entries array + per-entry stock increment loop needs a transaction | **Medium** |
| `expenses.js` | 57 | ~50% DB-specific: embedded rows array + date-range filtering | **Medium** |
| `bills.js` | 45 | ~50% DB-specific: embedded entries array + date-range filtering | **Medium** |
| `chemicals.js` | 88 | ~55% DB-specific: flat tables (easy) but summary/remaining calc becomes a SQL `SUM`, and usage-vs-remaining validation should move into a transaction | **Medium** |
| `payments.js` | 91 | ~55% DB-specific: regex `$or` search, conditional cheque fields, client-match validation against another table | **Medium** |
| `profit.js` | 103 | ~90% DB-specific: this file *is* a set of Mongo-style aggregations done in JavaScript (`Promise.all` + `.reduce()` across 4 collections, filtered by date regex, called once per month × 12 for annual/analytics views) — needs to become real SQL `GROUP BY`/`SUM` queries joined against the new child tables | **Large** |

**Total: 10 route files need rewriting.** Two (`slips.js`, `profit.js`) are large/high-risk; six are medium; two (`auth.js`, and to a lesser extent `articles.js`) are small. `db.js` (connection setup) and `models/*.js` (all 10) are fully replaced, not incrementally migrated.

---

## 2. ELECTRON MIGRATION SCOPE

### 2.1 What needs to change to run backend + frontend inside one Electron shell

- **Main process** (`electron/main.js`, new file): creates the `BrowserWindow`, and on app `ready`, **starts the Express server in-process** (import and call the existing `Backend/src/index.js` app/listen logic as a module rather than a separate CLI process) or **spawns it as a child process** and waits for a health-check before loading the renderer. In-process is simpler for a single-user desktop app; child-process is more isolation but adds IPC/process-lifecycle complexity for no real benefit here since there's only one consumer (the Electron window itself).
- **Renderer**: the built Vite frontend (`frontend/app/dist`) loaded via `mainWindow.loadFile()` (or `loadURL('http://localhost:5000')` if the backend also serves the static build — see §2.2).
- **Preload script**: currently unnecessary if HTTP calls are kept (see §2.2) — only needed if any IPC bridge or native OS integration (file save dialogs, printer access, auto-update) is added.
- **Local MSSQL connection instead of Atlas**: `Backend/src/db.js` currently does `mongoose.connect(uri)` against an Atlas URI from `.env`. The MSSQL equivalent needs a connection pool (e.g. `mssql`/`tedious`) pointed at `localhost` or a bundled `(localdb)\...` instance instead of a remote cluster — this also removes the network-dependency failure mode entirely (no more "Atlas SSL hiccup" class of bug noted in the project status doc), which is a net simplification.
- **Auto-start of backend on app launch**: instead of two `npm run dev` terminals (current dev workflow), Electron's main process becomes responsible for starting the Express server before showing the window, and cleanly shutting it down (and closing the DB connection pool) on `app.on('window-all-closed')` / `before-quit`.
- **Environment/config**: `.env`-style config (`JWT_SECRET`, DB connection string) can no longer rely on a developer-managed `.env` file on an end-user's machine — needs to move to either a bundled default config, an Electron `app.getPath('userData')`-stored config file, or a first-run setup screen. This is a meaningful UX addition, not just a config rename.

### 2.2 Local HTTP calls vs. refactoring to IPC

> **Note (2026-08-13):** this recommendation was reversed — see `DECISIONS.md` and `IPC_VS_HTTP_FINDINGS.md`. Kept here for historical context; do not treat as current guidance.

**Recommendation: keep local HTTP calls (Express server running inside Electron), do not refactor to IPC.**

| | Keep HTTP (Express inside Electron) | Refactor frontend to IPC |
|---|---|---|
| Frontend changes | **None** — `src/lib/api.ts` already points at `VITE_API_URL \|\| http://localhost:5000`; just needs to always resolve to the local Electron-hosted server | Every one of the 9 `lib/*.ts` files and every page that calls them needs rewriting from `fetch()` to `ipcRenderer.invoke()`, plus a matching `ipcMain.handle()` for every one of the ~30 existing endpoints |
| Backend changes | Express app runs largely unchanged (already a clean REST API) inside the main process instead of a standalone process | Every route handler's logic still exists, but now needs to be triggered from IPC channel handlers instead of Express routes — the route *logic* survives, but the *transport layer* is a full rewrite |
| Auth model | JWT Bearer token flow works unchanged | JWT becomes pointless (no network boundary to protect) — would need to be ripped out or kept as vestigial complexity |
| Effort | Low — mostly plumbing (start server, point renderer at it) | High — touches every single route and every single frontend API call for no functional benefit in a single-user, single-machine desktop app |
| Risk | Low | High (large surface area of files touched, more opportunities to introduce regressions in a rewrite that also has to happen for MSSQL) |

Given this migration *already* requires rewriting all 10 route files for MSSQL, doing an IPC refactor **at the same time** would roughly double the backend rewrite surface for no material benefit — Express-over-`localhost` inside Electron is a well-established, low-risk pattern and the existing REST/JWT structure has no downside once it's no longer crossing an untrusted network boundary. Reserve an IPC layer only for things HTTP genuinely can't do well (native file save dialogs for exported reports/receipts, OS print dialog integration, auto-update) — those can be thin, additive IPC channels layered on top of the existing HTTP API, not a wholesale replacement of it.

### 2.3 Packaging/build tooling and OS-level concerns

- **`electron-builder`** (or `electron-forge`) — needed to produce a Windows installer (`.exe`/NSIS or MSIX). Needs a build config for: app icon, publisher metadata, output target (`nsis` is the standard choice for a Windows desktop LOB app), and whether auto-update is in scope (adds `electron-updater` + a release feed if yes — not asked for here, treat as out of scope unless requested).
- **Native module concerns**: the MSSQL Node driver (`mssql`, built on `tedious`, which is pure JavaScript) avoids the native-binding rebuild problems that something like `msnodesqlv8` (native ODBC bindings) would introduce under Electron's custom Node ABI. **Recommend `mssql` (tedious-based) specifically to avoid needing `electron-rebuild`/`node-gyp` toolchain complexity** during packaging — this is a meaningful tooling decision, not a minor detail.
- **SQL Server itself must exist on the end-user's Windows machine.** This is the biggest OS-level open question and needs a decision before work starts:
  - **Bundle SQL Server Express or LocalDB** with the installer (larger installer size, but a genuinely "just install and run" experience) — LocalDB is lighter but has feature limitations (no remote connections, single-user by design, which actually fits this app's single-admin nature well).
  - **Require the end user/IT to have SQL Server already installed** and only ship a connection-config screen — smaller installer, but pushes a real deployment burden onto whoever installs this on a shop counter PC.
  - **Fall back to SQLite** for the desktop build specifically, keeping MSSQL only for a hypothetical multi-machine/server deployment — contradicts the explicit ask ("Replace MongoDB/Mongoose with MSSQL") but is worth flagging as a lower-friction alternative if ease-of-installation on a non-technical shop owner's PC turns out to matter more than the specific engine. **This is a decision to make with the user before building, not something to assume** — see the open question at the end of this report.
- **Code signing**: unsigned Windows executables trigger SmartScreen warnings on first run. Not strictly required to function, but worth budgeting for if this is going to be distributed outside a single developer's own machine.
- **Testing on a clean Windows machine/VM** (no Node, no existing SQL Server) is the only way to validate the "just install and run" claim — dev-machine testing alone will hide missing-dependency issues.

---

## 3. RISK AREAS

Ranked by how much rework/breakage risk they carry, based on what's actually in the code today:

1. **`slips.js` stock check-and-deduct logic** (§1.2.2) — already has a latent race condition in Mongo (separate check loop then deduct loop, no transaction/lock). Porting this "as-is" into MSSQL would carry the same bug forward; doing it *correctly* means new transactional logic that doesn't exist in the current codebase at all. Highest risk item in the whole migration because it's both the most business-critical path (selling stock) and the one most likely to be quietly wrong if rushed.

2. **`profit.js` aggregations** — currently just JS `Promise.all` + `.reduce()` over full collection scans filtered by a date regex, called repeatedly (once per month, up to 13 times for the annual/analytics endpoints). This needs to become real SQL `GROUP BY`/`SUM` queries joined against the new `SlipItems`/`ExpenseRows`/`BillEntries` child tables. Getting the joins right (avoiding fan-out double-counting when a `Slip` has multiple `SlipItems`, since `profit.js` sums `slip.total` not per-item) requires care — a naive `JOIN` + `SUM` across a one-to-many table will silently inflate `grossSales` if not written carefully (aggregate the child table first, or sum the already-denormalized `Total` column on the parent — the latter is safer and mirrors current behavior).

3. **Client identity/dedupe flow in `slips.js`** (phone-primary lookup, name-mismatch `409 phone_conflict` response, `clientResolution` two-step resolution) — this is intricate application logic with several branches (exact phone+name match / phone-only match with resolution / no match at all). Easy to introduce a subtle behavioral regression when rewriting the underlying queries even though the *logic* itself doesn't need to change, only its persistence layer.

4. **Cross-collection referential integrity that Mongo never enforced.** Mongo has no real foreign key constraints — `Production.entries[].articleId` is a bare string, `Slip.items[].name` matches articles by *name* not id. Moving to MSSQL with real FK constraints will surface every place these were already loosely coupled (e.g., what happens to historical `Slip.items` if an `Article` is renamed — currently nothing, since slip items store a name snapshot, not a live reference; this needs to be preserved deliberately as "snapshot, not FK" rather than accidentally turned into a live FK that breaks historical slips when articles change).

5. **Date-as-string filtering across 7 of 9 route files** (§1.2.4) — mechanically tedious rather than logically risky, but the sheer repetition (nearly every GET endpoint) means a systematic rewrite pattern needs to be established once and applied consistently, or the migration will produce inconsistent date-handling bugs across different modules (e.g. one route working correctly on month boundaries while another is off by a day due to timezone handling — `dateHelpers.js`'s week/month range functions mix `Date` objects, UTC, and local time in ways that would need re-verification against MSSQL's date functions).

6. **Electron backend lifecycle** — new failure mode that doesn't exist in the current architecture: what happens if the bundled/local SQL Server isn't running when Electron starts, or the app is closed while a write transaction is mid-flight. The current web-app deployment has no equivalent of "the database might not be there yet" since Atlas is always up; a desktop app needs explicit startup health-checks and user-facing error states for a DB that's actually allowed to not exist yet on first run.

7. **Auth/rate-limiting relevance inside a desktop shell** — `express-rate-limit` (5 login attempts / 15 min) and JWT expiry (`7d`) were designed for a networked multi-request-origin threat model. Inside a single-user Electron app talking to `localhost`, these aren't wrong to keep (defense in depth, and the Settings-based single-admin login still needs *some* gate), but worth a deliberate "keep or simplify" decision rather than carrying them forward unexamined.

---

## 4. EFFORT ESTIMATE

### 4.1 Rough breakdown by component

| Component | Size | Why |
|---|---|---|
| **SQL schema design** (14 tables, FKs, indexes, collation decisions) | **Medium** | Not large in table count, but §1.2's items (transactional integrity, unique constraints not present in Mongo, denormalized-snapshot columns) require actual design decisions, not just translation |
| **ORM/driver setup** (`mssql`/Prisma/Sequelize/TypeORM choice + connection pooling + migrations) | **Small–Medium** | One-time setup; recommend `mssql` (tedious) directly or Prisma with the MSSQL connector for migration tooling — either is well-trodden |
| **Backend route rewrites** (10 files) | **Large** | 2 large files (`slips.js`, `profit.js`), 6 medium, 2 small — see §1.3 table. This is the bulk of the total effort |
| **Transaction/concurrency work** (stock deduct, cascading deletes, singleton settings) | **Medium** | New logic, not present in current codebase (§1.2.2, §1.2.9) |
| **Electron shell setup** (main process, window, backend bootstrap, local DB connection, packaging config) | **Medium** | Well-understood pattern (§2.1–2.2), low novelty risk since HTTP-in-Electron is standard |
| **Packaging/installer + native dependency validation** | **Medium** | `electron-builder` config is small; the real cost is deciding and implementing the SQL Server distribution strategy (§2.3) and testing on a clean machine |
| **Testing** (backend route parity, stock/profit correctness, clean-machine install) | **Medium–Large** | No existing test suite (noted in the prior repo analysis) — this migration is exactly the kind of change that needs test coverage added *during* the work, not after, especially for stock deduction and profit aggregation correctness |
| **Frontend changes** | **None–Small** | If the API contract is preserved (recommended, §1.2.8) and HTTP calls are kept (recommended, §2.2), the frontend needs essentially no changes beyond pointing `VITE_API_URL` at the Electron-hosted local server |

### 4.2 Overall complexity: rewrite or incremental migration?

This is a **backend rewrite with a frontend-preserving wrapper**, not a full-application rewrite and not a light incremental migration:

- The **frontend is largely untouched** if the two recommendations above are followed (keep HTTP, preserve API response shape).
- The **backend is close to a full rewrite**: every model, every route file's data-access code, the connection layer, and the addition of transactional logic that doesn't currently exist. The route *validation and business-rule logic* (input checks, discount math, client dedupe rules) survives almost unchanged — only the persistence calls change — but given how tightly interleaved data access is with business logic in this codebase (no repository/service layer separating them, per the earlier repo analysis), "just swap the DB calls" in practice means touching nearly every line of every route file.
- Electron packaging is additive, well-scoped work layered on top, not a source of deep uncertainty on its own — **except** for the open question in §4.3.

### 4.3 Timeline (single developer)

Assuming a developer already competent in Node/Express, SQL Server, and Electron (not learning all three simultaneously), and assuming the SQL-Server-distribution question (§2.3) is resolved before work starts:

| Phase | Estimate |
|---|---|
| SQL schema design + migration scripts + ORM/driver setup | 3–5 days |
| Route rewrites (all 10 files, incl. `slips.js`/`profit.js` transactional logic) | 8–12 days |
| Electron shell (main process, packaging config, local DB bootstrap, first-run config) | 3–5 days |
| Integration testing (stock accuracy, profit correctness across months, clean-Windows-machine install) | 4–6 days |
| Buffer for unknowns (collation/locale issues, SQL Server distribution friction, regression fixes) | 3–5 days |
| **Total** | **~4–6 weeks** for one developer |

This assumes no test suite exists today and a lightweight one gets built alongside the rewrite for the highest-risk paths (stock deduction, profit calculation) rather than a comprehensive suite for the whole app — a full test suite would add meaningfully to the estimate but isn't implied by the request as stated.

**Open question worth resolving with the user before starting implementation:** whether SQL Server/LocalDB will be bundled with the installer or assumed pre-installed on the target Windows machine (§2.3) — this materially changes both the packaging effort and the end-user support burden, and isn't something to assume silently.
