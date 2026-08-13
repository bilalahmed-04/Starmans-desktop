# Starmans Backend

Data-access layer for the Starmans Sole House desktop app — **not a standalone server**. Express was removed entirely in Task 17 (see `TASKS.md`/`DECISIONS.md`); this code is consumed directly by `Desktop_app/main.js` over Electron IPC.

## Stack
- **Node.js** (ESM) + **`mssql`** (raw driver, no ORM — see `DECISIONS.md`'s "MSSQL data-access approach")
- **bcryptjs** for password hashing
- No JWT, no HTTP server — every call is same-process IPC (see `DECISIONS.md`'s Group 5 entries for why)

## Layout

- `src/models/*.js` — one file per table/domain, plain query functions against MSSQL (no business logic)
- `src/services/*.js` — business logic (validation + model orchestration), the layer `main.js`'s `ipcMain.handle` calls into directly
- `src/mssqlDb.js` — connection pool
- `migrations/` — hand-written numbered `.sql` schema files
- `seed.js` — populates demo data (`npm run seed`)

## Setup

```bash
cp .env.example .env   # set MSSQL_* vars
npm install
npm run seed            # first time only, against a fresh database
```

There is no `npm start`/`npm run dev` here — run the app via `Desktop_app/` (`npm start` there launches Electron, which loads this code directly).

---

## IPC channels (via `Desktop_app/preload.js` → `window.api.*`)

| Channel | `window.api.*` | Description |
|---|---|---|
| `auth:login` | `auth.login(username, password)` | Verifies credentials against `Settings` (bcrypt), no token |
| `auth:updateSettings` | `auth.updateSettings(payload)` | Change username/password |
| `articles:list` | `articles.list(filter?)` | List all articles (`color`, `maxStock`) |
| `articles:create` | `articles.create(data)` | Add article |
| `articles:delete` | `articles.delete(id)` | Delete article (cleans up production refs) |
| `clients:list` | `clients.list()` | List all clients (slips embedded) |
| `clients:get` | `clients.get(id)` | Single client with slips |
| `clients:create` | `clients.create(data)` | Create client |
| `slips:list` | `slips.list(filter?)` | All slips (`clientId`, `month`, `week`) |
| `slips:create` | `slips.create(data)` | Create slip + auto-create client if new; deducts stock |
| `slips:get` | `slips.get(id)` | Single slip |
| `slips:update` | `slips.update(id, items)` | Update slip (restores old stock, deducts new) |
| `slips:delete` | `slips.delete(id)` | Delete slip (restores stock) |
| `productions:list` | `productions.list(filter?)` | List productions (`month`, `week`) |
| `productions:create` | `productions.create(data)` | Record production run (adds to stock) |
| `expenses:list` | `expenses.list(filter?)` | List expenses (`period`, `month`) |
| `expenses:create` | `expenses.create(data)` | Add expense |
| `bills:list` | `bills.list(filter?)` | List bills (`month`) |
| `bills:create` | `bills.create(data)` | Add bill |
| `chemicals:summary` | `chemicals.summary()` | `{ totalPurchased, totalUsed, remaining }` |
| `chemicals:listPurchases` | `chemicals.listPurchases(filter?)` | Purchase history (`month`) |
| `chemicals:createPurchase` | `chemicals.createPurchase(data)` | Log a purchase |
| `chemicals:listUsages` | `chemicals.listUsages(filter?)` | Usage log (`month`) |
| `chemicals:createUsage` | `chemicals.createUsage(data)` | Log usage (single or `{ entries: [...] }`) |
| `payments:list` | `payments.list(filter?)` | List payments (`period`, `month`, `search`) |
| `payments:create` | `payments.create(data)` | Record payment (client name+phone must match) |
| `profit:monthly` | `profit.monthly(month?)` | `month='YYYY-MM'` |
| `profit:annual` | `profit.annual(year?)` | |
| `profit:analytics` | `profit.analytics(month?, year?)` | |

Every channel resolves `{ ok: true, data }` on success or `{ ok: false, error: { message, code } }` on failure — see the repo root's `DECISIONS.md`, Group 5 entries.
