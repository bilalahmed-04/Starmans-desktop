# Starmans (Soleria Sole House) — Project Status

> Snapshot as of 2026-07-17. Covers what's built, what's in progress, and what's left across the frontend and backend.

---

## 1. What This Project Is

A billing, inventory, and production-tracking web app for a shoe-sole manufacturing business. Originally scoped/designed under the name **"Soleria Sole House"** (see `Soleria - Design Specification.md`, `Soleria - Project Overview.md`, `Soleria - Use Cases.md`), but the shipped app currently displays the brand as **"Starmans / Starmans Sole House"** — the rename to "Soleria" in the design docs has not been applied to the running app.

## 2. Repo Layout

```
Starmans/
├── Backend/              # Express + MongoDB API
├── frontend/app/         # React 19 + Vite + TypeScript SPA
├── Database/             # (support files)
├── Project_detials/      # Design spec, overview, use cases, change-request docs
├── frontend_images/, images/, fontend_images.zip   # design reference assets
```

## 3. Backend (`Backend/`)

- **Stack:** Express, Mongoose/MongoDB Atlas, JWT auth (`jsonwebtoken`), `bcryptjs`, `express-rate-limit`, `node --watch` for dev reload.
- **Run:** `npm run dev` (port 5000). Requires `Backend/.env` with `MONGODB_URI`, `JWT_SECRET`, etc. (not committed).
- **Auth:** Single-admin login (`Settings` model holds one username/password hash) — `POST /auth/login` issues a JWT; `PATCH /auth/settings` changes username/password. Login is rate-limited (5 attempts / 15 min per IP, successful logins don't count).
- **Domain routes**, one per resource: `articles`, `clients`, `slips`, `productions`, `expenses`, `bills`, `chemicals`, `payments`, `profit` — all mounted in `src/index.js`, all protected behind `requireAuth` middleware except `/auth/login` and `/health`.
- **Data model:** Articles (stock) ← sold via Slip/SlipItem under a Client; Production adds stock; Expense/Bill/ChemPurchase/ChemUsage/Payment are separate ledgers. Mirrors the frontend's in-memory shape almost exactly (see `frontend/app/src/types/index.ts`).
- **Known issue (flagged, not yet fixed):** `db.js` logs the full MongoDB connection string — including username/password — to stdout on connect. Should be redacted before this goes anywhere with shared logs.
- **Known issue (observed, intermittent):** MongoDB Atlas connection has occasionally hung/thrown SSL errors on isolated requests (`/auth/login` timing out or 500ing once) — recovered on retry. Root cause not investigated; likely Atlas-side network blip, not app logic.

## 4. Frontend (`frontend/app/`)

- **Stack:** React 19 + TypeScript + Vite 7, Tailwind CSS + shadcn/ui primitives (mostly unused — pages are hand-styled with custom CSS classes, not shadcn components), `lucide-react` icons.
- **Run:** `npm run dev` (port 3000, configured in `vite.config.ts`).
- **State & routing:** No React Router in use. A single `useReducer` store (`src/context/AppContext.tsx`) holds all domain data and `currentPage` (a plain string). `src/App.tsx` renders a page component by matching `page.startsWith(prefix)`. All data now comes from the backend API (`src/lib/*.ts` fetch helpers) — the old in-memory demo-data version has been fully wired to the backend.
- **Styling system:** CSS custom properties defined in `src/index.css` (`--brand-navy`, `--brand-gold`, `--app-bg`, `--card-surface`, `--primary-text`, `--secondary-text`, `--muted-text`, `--dark-heading`, `--gold-text`, `--error`, `--success`, `--border-color`, etc.), consumed via inline `style={{ color: 'var(--x)' }}` throughout. Reusable classes: `.card-white`, `.soleria-input`, `.btn-gold/navy/dashed/outline/danger`, `.soleria-table-header/row`, `.tab-pill-*`, `.banner-*`.
- **Pages implemented:** Login, Home (new), New Sale, Slips (+ Client Detail, Slip Detail/invoice), Production, Stock, Bills, Chemical, Expenses, Profit, Payment, Settings — all present in `src/pages/`.

### 4.1 Design Reference Docs (`Project_detials/`)
- `Soleria - Design Specification.md` — full color/type/spacing/component spec, screen-by-screen. Source of truth for anything new being built.
- `Soleria - Project Overview.md`, `Soleria - Use Cases.md` — product context (not yet read in depth this session).
- `Claude Code Prompt - Frontend Changes.md` — a 6-feature change request (see §5 below), currently being implemented incrementally per user instruction ("one task in one go, don't overwhelm").

## 5. In-Flight Work: "Claude Code Prompt — Frontend Changes"

Per `Project_detials/Claude Code Prompt - Frontend Changes.md`, scope is: rename the admin user, then 6 features. Progress:

| # | Feature | Status |
|---|---|---|
| — | Replace `"Ehsan Ali"` → `"Abdul Aziz"` everywhere (admin footer name + initials `EA`→`AA`) | ✅ Done |
| 1 | **Home page**: new first sidebar nav item, post-login lands here, welcome header w/ live clock, 4 stat cards (Today's Sales, Today's Revenue, Total Clients, Low Stock — clickable to Stock), Recent Slips table (last 5) | ✅ Done, verified in browser |
| 2 | Stat card hover-zoom (`scale(1.04)` + shadow, Low Stock also gets red border on hover) | ✅ Done (built as part of Feature 1) |
| 3 | **Dark mode toggle**: 36×36 circle button in header (🌙/☀️), `data-theme` attr on the app shell, dark CSS variable overrides so all existing pages adapt automatically, persisted via `localStorage` | ✅ Done, verified across Home/New Sale/Stock — persists across navigation |
| 4 | Login page animated **DotField** canvas background (cursor-reactive dot grid, gold glow near cursor, gold→navy gradient) | ✅ Done, verified in browser |
| 5 | Profit → Analytics: replace static SVG pies with **animated interactive donut charts** (mount animation, hover highlight, legend sync, center label) | ✅ Done, verified in browser |
| 6 | (Duplicate of #5's mount-animation requirement — confirm it re-triggers every tab visit, not just once) | ✅ Done, verified — animation restarts each time Analytics tab is revisited |

**Open item raised by user, not yet resolved:** user reported "texts which are black are not being shown clearly in dark mode" after Feature 3 shipped. Checked Home, New Sale, Stock pages in dark mode via browser screenshots — all legible (initial concern was a screenshot-compression artifact, not real). No hardcoded black/`#2B2B2B`-style colors found via grep across `pages/` or `components/`. Native `<select>` dropdown popups (OS-rendered) do stay black-on-white regardless of theme — flagged as a possible browser-native limitation, not a CSS bug. **Still waiting on the user to point to the specific page/element** where the problem is visible before this can be closed out.

## 6. Environment / Local Dev Notes

- Backend needs `express-rate-limit` (was missing from `node_modules` at one point — installed via `npm install express-rate-limit`).
- Login credentials in the current dev database are **not** the seeded `admin`/`admin` — actual working credentials are `bilal` / `12345678` (seed.js still defaults to `admin`/`admin`, so the DB has been modified since seeding, likely via the Settings page).
- Two dev servers must run concurrently: `Backend/` (`npm run dev`, port 5000) and `frontend/app/` (`npm run dev`, port 3000).

## 7. Known Rough Edges (not yet actioned)

- MongoDB connection string logged in cleartext on backend startup (`Backend/src/db.js`).
- Brand naming inconsistency: design docs say "Soleria," running app says "Starmans."
- `NavPage` TypeScript union type in `src/types/index.ts` is dead code — not referenced anywhere; `currentPage` is typed as plain `string`.
- Occasional MongoDB Atlas connectivity hiccups causing a hung/500 login request (self-resolved on retry so far).
