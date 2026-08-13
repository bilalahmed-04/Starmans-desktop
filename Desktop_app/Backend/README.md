# Starmans Backend API

Express.js REST API for the Starmans Sole House inventory & billing app.

## Stack
- **Node.js** (ESM) + **Express**
- **JWT** auth (Bearer token)
- **bcryptjs** for password hashing
- **In-memory store** (`src/store.js`) — swap with MongoDB/SQL when ready

## Setup

```bash
cp .env.example .env   # set JWT_SECRET
npm install
npm run dev            # starts with --watch
```

## Auth

All routes except `POST /auth/login` require `Authorization: Bearer <token>`.

### `POST /auth/login`
```json
{ "username": "admin", "password": "admin" }
```
Returns `{ token, username }`.

### `PATCH /auth/settings`
```json
{ "username": "newname", "oldPassword": "admin", "newPassword": "newpass" }
```
Leave `newPassword` blank to only update username.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login |
| PATCH | `/auth/settings` | Change username/password |
| GET | `/articles` | List all articles |
| POST | `/articles` | Add article |
| DELETE | `/articles/:id` | Delete article (restores production refs) |
| GET | `/clients` | List all clients (slips embedded) |
| GET | `/clients/:id` | Single client with slips |
| POST | `/clients` | Create client |
| GET | `/slips` | All slips (`?clientId`, `?month=YYYY-MM`, `?week=YYYY-Www`) |
| POST | `/slips` | Create slip + auto-create client if new; deducts stock |
| GET | `/slips/:id` | Single slip |
| PUT | `/slips/:id` | Update slip (restores old stock, deducts new) |
| DELETE | `/slips/:id` | Delete slip (restores stock) |
| GET | `/productions` | List productions (`?month`, `?week`) |
| POST | `/productions` | Record production run (adds to stock) |
| GET | `/expenses` | List expenses (`?period=weekly\|monthly\|alltime`, `?month`) |
| POST | `/expenses` | Add expense |
| GET | `/bills` | List bills (`?month=YYYY-MM`) |
| POST | `/bills` | Add bill |
| GET | `/chemicals/summary` | `{ totalPurchased, totalUsed, remaining }` |
| GET | `/chemicals/purchases` | Purchase history (`?month`) |
| POST | `/chemicals/purchases` | Log a purchase |
| GET | `/chemicals/usage` | Usage log (`?month`) |
| POST | `/chemicals/usage` | Log usage (single or `{ entries: [...] }`) |
| GET | `/payments` | List payments (`?period=weekly\|monthly`, `?month`, `?search`) |
| POST | `/payments` | Record payment (client name+phone must match) |
| GET | `/profit/monthly` | `?month=YYYY-MM` |
| GET | `/profit/annual` | `?year=YYYY` |
| GET | `/profit/analytics` | `?month=YYYY-MM&year=YYYY` |
| GET | `/health` | Health check |

## Swapping the database

All data access is in `src/store.js`. Each route file imports `{ db }` from there and reads/writes plain arrays. To migrate to MongoDB (or any DB):

1. Replace `db.*` array operations with async model calls in each route file.
2. Make route handlers `async` and add `await` where needed.
3. Remove the seed data from `store.js` (or move it to a seed script).
