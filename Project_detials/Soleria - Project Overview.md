# Soleria Sole House — Project Overview

> A detailed explanation of the Soleria Billing & Inventory Management System — what it is, why it exists, how it is built, and what every part does.

---

## 1. What Is Soleria?

Soleria Sole House is a **desktop web application** built for a shoe sole manufacturing and retail business. It is a single-user, in-browser management system that handles the full operational cycle of a sole house:

- Selling shoe soles to clients and generating printed receipts (slips)
- Tracking inventory levels across multiple sole types
- Recording daily production so stock is always current
- Logging utility bills, operating expenses, and chemical purchases
- Tracking payments received from clients
- Generating profit reports to understand business health

The application runs entirely in the browser with no server or database. All data lives in JavaScript memory for the session. There is no login server — credentials are validated client-side against a stored username/password.

---

## 2. Who Is It For?

**Primary user:** A small-to-medium shoe sole manufacturer or trader in Pakistan who:
- Issues hand-counted invoices today and wants a digital alternative
- Needs to know stock levels without manually counting inventory
- Wants weekly/monthly reports without a spreadsheet
- Operates at a shop counter on a laptop or desktop computer

**Designed for one user:** There is no multi-user, multi-branch, or role-based access system. One administrator manages everything.

---

## 3. Business Context

### The Core Problem

A sole house sells sole products (PVC, Rubber, TPR, Leather, EVA, Crepe, PU) to shoe manufacturers and traders. Before Soleria, a typical shop would:
- Write invoices on paper or in a basic spreadsheet
- Lose track of stock unless manually counted
- Have no easy way to see which clients owe payments
- Calculate profit only at year-end (if ever)

### What Soleria Solves

| Problem | Soleria Solution |
|---|---|
| Paper invoices are slow and error-prone | Digital slip system with auto-numbering (SL-XXXX) |
| Stock goes out of sync | Stock auto-deducts on sale, auto-increments on production |
| No way to see weekly/monthly sales | Built-in Weekly & Monthly Reports on every module |
| Expenses are untracked | Dedicated Expenses module with reports |
| Bills forgotten | Bills module grouped by month |
| Profit calculation is manual | Profit module: Gross Sales − All Expenses = Net Profit |
| Client payments not recorded | Payment module with client verification |

---

## 4. Technology

| Aspect | Detail |
|---|---|
| Language | HTML, CSS, JavaScript (no frameworks installed separately) |
| UI Engine | Design Component (DC) — a streaming React-based runtime |
| Fonts | Google Fonts: Lora (serif) + Inter (sans-serif) |
| Data storage | JavaScript in-memory state (resets on refresh unless exported) |
| Export | Standalone self-contained HTML file (all assets inlined, works offline) |
| Print | Native browser print — `window.print()` with `@media print` CSS |
| No backend | Zero server, zero database, zero API calls |

The application is delivered as a single `.html` file that can be opened in any modern browser with no installation required.

---

## 5. Application Modules

The application is divided into **10 modules**, each accessible from the sidebar navigation.

---

### 5.1 New Sale
The primary operational screen. Staff use this throughout the day whenever a client makes a purchase.

**What it does:**
- Accepts one or more sale line items (article + qty + price + optional discount)
- Validates stock availability before confirming
- Accepts client name and phone — recognises returning clients automatically
- Calculates line totals and a grand total live
- On confirm: generates a numbered slip (SL-XXXX), deducts stock, navigates to the invoice

**Key business rules:**
- Discount can be percentage-based or flat ₨ amount, per line
- Slip number auto-increments (starts at SL-1047 in demo)
- If a client name matches an existing record, their phone is pre-associated; new names create a new client record
- Slips can be edited after creation; stock is recalculated correctly on edit

---

### 5.2 Slips
The historical record of all sales, organised by client.

**What it does:**
- **Clients tab:** grid of all clients; click any to see their individual slips
- **Client Detail:** lists all slips for a client with Open / Edit / Delete actions
- **Slip Detail (Invoice):** formatted receipt with all line items, discounts, totals, client info, and footer; printable
- **Weekly Report:** all slips from the current week — Slips count, Pairs Sold, Grand Total
- **Monthly Report:** same scope as weekly, for the current calendar month

---

### 5.3 Stock
Inventory dashboard with article management.

**What it does:**
- Shows all articles with Color, Size, and current stock quantity
- Highlights low-stock items (below configurable threshold, default 20 pairs) in red
- Search to filter by article name
- Each article row has a red ✕ **delete button** — clicking it shows a confirmation dialog and permanently removes the article from inventory; the article disappears from Stock, New Sale, and Production simultaneously
- Stock increases via Production and decreases via Sales; direct editing is not available

**Note:** Deleted articles cannot be recovered. Historical slips that reference deleted articles are preserved.

---

### 5.4 Production
Records units manufactured each day and adds them to stock.

**What it does:**
- **Daily tab:** user selects a date, enters qty produced per article, clicks Confirm — stock updates immediately
- **Weekly tab:** report of all production this week, per article, with grand total
- **Monthly tab:** same as weekly for the current month

**Business rule:** Production is the only way stock increases (other than creating a new article with opening stock).

---

### 5.5 Bills
Records recurring utility and overhead bills.

**What it does:**
- **Add Bills:** date-stamped entry form — add bill name + amount for each utility (Electricity, Gas, Water, Internet, Rent, etc.)
- **All Bills:** full history grouped by month — each group shows individual entries and a monthly total
- Bills feed into the Profit module as an expense category

---

### 5.6 Chemical
Dedicated module for tracking chemical material (used in sole manufacturing).

**What it does:**
- **Manage tab:** summary card (Total Purchased / Total Used / Remaining in kg) + two forms:
  - Log a chemical purchase (date, qty kg, cost ₨)
  - Log daily usage (multiple rows of date + qty)
- **Purchase History:** grouped by month, filterable by date, with monthly totals
- **Usage Log:** grouped by month, filterable by date, with monthly totals
- Chemical cost feeds into the Profit module

---

### 5.7 Expenses
Records general operating expenses (non-bill, non-chemical costs).

**What it does:**
- **New Entry:** multi-row form — description + amount per item, running total, Confirm button
- **Weekly:** all entries this week, grouped, with total
- **Monthly:** all entries this month, grouped, with total
- **All Time:** complete expense history, grouped, with grand total
- Operating expenses feed into the Profit module

---

### 5.8 Profit
Aggregates all financial data into a profit & loss view.

**Formula:**
```
Net Profit = Gross Sales − (Operating Expenses + Utility Bills + Chemical Costs)
```

**What it does:**
- **Monthly tab:** month navigator → detailed P&L breakdown for a single month — Gross Sales, each expense category, Total Expenses, Net Profit (green/red)
- **Annual tab:** year navigator → monthly table for all 12 months with Gross, Expenses, Net per row and year totals
- **Analytics tab:** Year + Month dropdowns → SVG pie charts showing expense composition (Operating `#B08D57` / Bills `#4A7FC1` / Chemical `#3F7D58`) for the selected month and the selected year

---

### 5.9 Payment
Records payments received from clients against their outstanding invoices.

**What it does:**
- **New Payment tab:** validated form — client name and phone must match an existing client record before the Confirm button activates; records payment method, amount, optional description, and cheque-specific dates; shows all recorded payments below the form
- **Weekly tab:** payments from the current week, searchable, with Total Collected header
- **Monthly tab:** payments for any selected month, searchable, with Total Collected + payment count footer

**Validation logic:**
1. Client name is matched case-insensitively against all existing clients
2. Phone number must match that client's stored phone exactly
3. Only when both match does the Confirm Payment button become active
4. Payment method options: Cash, Bank Transfer, Cheque, Online

**Cheque payments (special fields):**
- **Collection Date** — automatically set to today by the system; not editable by the user
- **Cheque Date** — the date printed on the cheque; user-selectable
- Both fields appear only when Cheque is the selected payment method

**Description field:** Optional free-text note for any payment (e.g. "Partial payment for SL-1040", "Advance for next order").

**Note:** Payments are informational — they are recorded for accounting reference but do not automatically reduce "outstanding balance" figures (no accounts-receivable ledger is maintained).

---

### 5.10 Settings
Allows the administrator to change their login credentials.

**What it does:**
- Update username
- Change password (requires entering old password)
- Inline success or error feedback

---

## 6. Data Model

All data lives in the component's JavaScript state. There is no external database.

```
State {
  page: string                  // current screen
  articles: Article[]           // inventory items
  clients: Client[]             // each client has an array of slips
  productions: Production[]     // daily production logs
  expenses: Expense[]           // operating expense entries
  bills: Bill[]                 // utility bill entries
  chemPurchases: ChemPurchase[] // chemical purchase records
  chemUsage: ChemUsage[]        // daily chemical usage records
  payments: Payment[]           // client payment records
}

Article  { id, name, price, stock, color, size }
Client   { id, name, phone, slips: Slip[] }
Slip     { id, no, date, time, items: SlipItem[], total }
SlipItem { name, qty, price, subtotal, discountType, discountAmount, discountPct, amount, desc, size, color }
Production { id, date, entries: { articleId, articleName, qty }[] }
Expense  { id, date, time, rows: { desc, price }[] }
Bill     { id, date, month, entries: { name, amount }[] }
ChemPurchase { id, date, qty, cost }
ChemUsage    { id, date, qty }
Payment  { id, date, time, clientId, clientName, clientPhone, method, amount, desc, collectionDate, chequeDate }
```

---

## 7. Key Design Decisions

### Single-file, no backend
The entire app ships as one HTML file. There is no login API, no database, no CDN dependency at runtime (the standalone version inlines all fonts). This makes it trivially deployable — just open the file.

### In-memory state
All data resets when the page is refreshed unless the user exports the standalone HTML. This is intentional for a first version: zero infrastructure, zero maintenance, zero cost. A future version could add `localStorage` persistence or a lightweight backend.

### Pakistani Rupees (₨)
All monetary values are stored as numbers and displayed with ₨ prefix and `toLocaleString('en-US')` thousand separators (e.g. ₨ 12,500).

### Stock is computed, not manually set
Inventory stock levels are the result of: Opening Stock + Production − Sales. Direct editing of stock is intentionally not provided to prevent accidental data corruption.

### Profit is derived, not stored
Profit is calculated on-the-fly from sales, expenses, bills, and chemical costs. There is no "profit" table — it is always computed fresh from source records.

### Real-time validation everywhere
Forms use live validation with colour-coded hints (green = valid, red = invalid) rather than error messages that appear only on submit. This reduces friction at the counter.

### Print is first-class
Every report and the slip invoice are print-ready. `[data-no-print]` attributes hide all UI chrome. The print stylesheet produces compact, clean documents at 8mm margin.

---

## 8. Demo Credentials & Pre-loaded Data

| Item | Value |
|---|---|
| Username | `admin` |
| Password | `admin` |
| Clients | 5 (Ahmed Footwear, Khan Shoe House, Malik Traders, Bilal Shoe Mart, Raza Brothers) |
| Slips | 9 (SL-1035 through SL-1046, all June 2026) |
| Articles | 7 sole types (PVC, Rubber, TPR, Leather, EVA, Crepe, PU) |
| Expenses | 5 entries (June 2026) |
| Bills | 5 entries (May–June 2026) |
| Chemical | 2 purchases + 7 daily usage entries (June 2026) |
| Payments | None (user creates these) |

---

## 9. File Structure

```
Soleria Billing.dc.html          ← Main editable source (Design Component)
Soleria Billing - Standalone.html ← Self-contained offline export (bundled)
Soleria - Design Specification.md ← Visual & structural design reference
Soleria - Use Cases.md           ← All functional use cases
Soleria - Project Overview.md    ← This file — full project documentation
support.js                        ← DC runtime (do not edit)
```

---

## 10. Future Enhancement Ideas

The following are not currently implemented but represent natural next steps:

| Feature | Description |
|---|---|
| `localStorage` persistence | Save all state to browser storage so data survives page refresh |
| Outstanding balance tracker | Show how much each client owes vs. how much they have paid |
| Multi-user roles | Separate cashier and manager views |
| Export to CSV / Excel | Allow exporting slips and reports as spreadsheets |
| SMS / WhatsApp receipt | Send slip to client's phone number |
| Barcode / article ID scanner | Speed up article selection at the counter |
| Cloud sync | Persist data to a server so multiple devices stay in sync |
| Low-stock alerts | Email or notification when any article goes below threshold |
| Client credit limit | Block sales if a client's outstanding balance exceeds a limit |
