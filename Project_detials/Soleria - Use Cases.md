# Soleria Sole House — Use Cases

> All use cases for the Soleria Billing & Inventory Management System. Each use case describes the actor, trigger, steps, and outcome.

---

## Actors

| Actor | Description |
|---|---|
| **Administrator** | The logged-in user (shop owner or manager). Single-user system — all actions performed by the same account. |

---

## Module 1 — Authentication

### UC-01 Log In
**Trigger:** App loads or user is logged out.
**Steps:**
1. User sees the login screen with username and password pre-filled.
2. User presses **Log In**.
3. System validates credentials.
4. On success → navigates to **New Sale**.
5. On failure → shows inline error "Please enter username and password."

### UC-02 Log Out
**Trigger:** User clicks their name/avatar in the sidebar footer.
**Steps:**
1. Admin popup appears with "Log out" option.
2. User clicks **Log out**.
3. System clears session and returns to the login screen.

### UC-03 Change Password
**Trigger:** User clicks their name/avatar → "Change Password".
**Steps:**
1. System navigates to Settings screen.
2. User enters current username, old password, and new password.
3. User clicks **Save Changes**.
4. System validates and saves. Shows inline success message.

---

## Module 2 — New Sale

### UC-04 Create a New Sale (Slip)
**Trigger:** User navigates to **New Sale**.
**Steps:**
1. User selects an article from the dropdown. System shows current stock level.
2. User enters Qty, Unit Price.
3. Optionally sets a discount (% or flat ₨), Size, Color, Description.
4. User optionally clicks **+ Add Article** to add more lines.
5. User enters Client Name and Phone Number.
   - If client already exists: system shows a green "Existing client" pill.
6. When all rows are valid, the **Confirm Sale** header button activates.
7. User clicks **Confirm Sale**.
8. System deducts stock, saves the slip, and navigates to the new Slip Detail.

### UC-05 Apply a Discount to a Line Item
**Trigger:** Within UC-04, user sets discount type and value.
**Steps:**
1. User clicks **%** toggle → discount is calculated as a percentage of the line total.
2. Or user clicks **₨** toggle → discount is a flat amount.
3. System shows a discount hint ("saves ₨ X") in green below the input.

### UC-06 Remove a Sale Line
**Trigger:** Multiple rows exist in the sale.
**Steps:**
1. User clicks the **✕** button on any row (not available on the last remaining row).
2. Row is removed. Totals update instantly.

---

## Module 3 — Stock

### UC-07 View Current Stock
**Trigger:** User navigates to **Stock**.
**Steps:**
1. System displays all articles with Color, Size, and In Stock quantity.
2. Articles below the low-stock threshold (default: 20 pairs) show a red "Low stock" label.
3. User can type in the search box to filter articles.

---

## Module 4 — Slips

### UC-08 Browse Clients & Their Slips
**Trigger:** User navigates to **Slips → Clients** tab.
**Steps:**
1. System displays a card grid of all clients.
2. User can search by name.
3. User clicks a client card → Client Detail screen shows all their slips.

### UC-09 View a Slip (Invoice)
**Trigger:** User clicks a slip row in Client Detail.
**Steps:**
1. System displays the formatted invoice with all line items, discounts, and totals.
2. User can **Print** the slip from the header button.

### UC-10 Edit an Existing Slip
**Trigger:** User clicks **Edit** on a slip in Client Detail or on the Slip Detail screen.
**Steps:**
1. System re-opens the New Sale screen pre-filled with the slip's data.
2. An editing banner shows the slip number.
3. User makes changes and clicks **Confirm Sale**.
4. System reverses the old stock deductions, applies the new ones, and replaces the slip.

### UC-11 Delete a Slip
**Trigger:** User clicks **Delete** on Slip Detail or Client Detail.
**Steps:**
1. Browser confirmation dialog appears.
2. On confirm: slip is deleted; stock quantities are restored.
3. System returns to Client Detail.

### UC-12 View Weekly Sales Report
**Trigger:** User navigates to **Slips → Weekly Report** tab.
**Outcome:** Table of all slips from the current calendar week. Summary shows Slips count, Pairs Sold, and Grand Total.

### UC-13 View Monthly Sales Report
**Trigger:** User navigates to **Slips → Monthly Report** tab.
**Outcome:** Table of all slips from the current calendar month. Same summary footer. User can print.

---

## Module 5 — Production

### UC-14 Log Daily Production
**Trigger:** User navigates to **Production → Daily** tab.
**Steps:**
1. User selects a date (defaults to today).
2. System shows all articles. User enters qty produced per article.
3. User clicks **Confirm Production**.
4. System adds the produced quantities to each article's stock.
5. Success message appears. Input fields clear.

### UC-15 View Weekly Production Report
**Trigger:** User navigates to **Production → Weekly** tab.
**Outcome:** Table showing all articles produced during the current week, with per-article totals and grand total pairs produced.

### UC-16 View Monthly Production Report
**Trigger:** User navigates to **Production → Monthly** tab.
**Outcome:** Same layout as weekly but scoped to the current calendar month.

---

## Module 6 — Bills

### UC-17 Record Utility Bills
**Trigger:** User navigates to **Bills → Add Bills** tab.
**Steps:**
1. User selects a bill date.
2. User enters bill name and amount for each utility (Electricity, Gas, Water, etc.).
3. User clicks **+ Add Row** to add more.
4. User clicks **Confirm Bills**.
5. System saves the bill entry. Success message appears.

### UC-18 View All Bills
**Trigger:** User navigates to **Bills → All Bills** tab.
**Outcome:** Bills grouped by month. Each group shows individual entries and a month total.

---

## Module 7 — Chemical

### UC-19 Log a Chemical Purchase
**Trigger:** User navigates to **Chemical → Manage** tab.
**Steps:**
1. User enters purchase date, quantity (kg), and cost (₨).
2. User clicks **Add Purchase**.
3. System saves the purchase and updates the "Total Purchased" and "Remaining" summary figures.

### UC-20 Log Daily Chemical Usage
**Trigger:** User navigates to **Chemical → Manage** tab.
**Steps:**
1. User adds one or more rows of date + qty used (kg).
2. User clicks **Confirm Usage**.
3. System saves entries and updates "Total Used" and "Remaining" summary.

### UC-21 View Chemical Purchase History
**Trigger:** User navigates to **Chemical → Purchase History** tab.
**Steps:**
1. System shows purchases grouped by month.
2. User can filter by date or month string.
3. Each group shows date, qty, cost, and a monthly total.

### UC-22 View Chemical Usage Log
**Trigger:** User navigates to **Chemical → Usage Log** tab.
**Steps:**
1. System shows usage grouped by month.
2. User can filter by date or month string.
3. Each group shows date, qty used, and a monthly total.

---

## Module 8 — Expenses

### UC-23 Record Operating Expenses
**Trigger:** User navigates to **Expenses → New Entry** tab.
**Steps:**
1. User enters description and amount for each expense item (e.g. Shop Rent, Labour Wages).
2. User clicks **+ Add Expense** to add more rows.
3. Running total updates live.
4. User clicks **Confirm** (active when at least one valid row exists).
5. System saves the expense entry with date and time.

### UC-24 View Weekly Expense Report
**Trigger:** User navigates to **Expenses → Weekly** tab.
**Outcome:** All expense entries from the current week, grouped, with a weekly total.

### UC-25 View Monthly Expense Report
**Trigger:** User navigates to **Expenses → Monthly** tab.
**Outcome:** All expense entries from the current month, grouped, with a monthly total.

### UC-26 View All-Time Expense Report
**Trigger:** User navigates to **Expenses → All Time** tab.
**Outcome:** All expense entries ever recorded, grouped chronologically, with grand total.

---

## Module 9 — Profit

### UC-27 View Monthly Profit Report
**Trigger:** User navigates to **Profit → Monthly** tab.
**Steps:**
1. Month navigator (← →) or month picker selects the target month.
2. System calculates: Gross Sales − (Operating Expenses + Utility Bills + Chemical Costs) = Net Profit.
3. Report card shows each figure. Net Profit is displayed in Lora 32px — green if positive, red if negative.

### UC-28 View Annual Profit Report
**Trigger:** User navigates to **Profit → Annual** tab.
**Steps:**
1. Year navigator selects the target year.
2. Table shows Jan–current month with Gross, Expenses, Net per row.
3. Footer shows year totals.

### UC-29 View Profit Analytics (Pie Charts)
**Trigger:** User navigates to **Profit → Analytics** tab.
**Steps:**
1. User selects Year and Month from dropdowns.
2. System renders two pie charts: Monthly Breakdown + Annual Breakdown.
3. Each chart breaks expenses into Operating / Bills / Chemical.
4. Net Profit/Loss shown below each chart.

---

## Module 10 — Payment

### UC-30 Record a Client Payment
**Trigger:** User navigates to **Payment → New Payment** tab.
**Steps:**
1. User enters Client Name. System validates in real time — shows green "Client found" or red "No client found."
2. User enters Phone Number. System validates against the matched client's record — shows "Phone matched" or "does not match."
3. When both match, a green Verified card appears showing client initials, name, phone, and slip count.
4. User selects Payment Method (Cash / Bank Transfer / Cheque / Online).
   - If **Cheque** is selected, a panel appears with two fields:
     - **Collection Date** — read-only, auto-set to today by the system (non-editable).
     - **Cheque Date** — user picks the date printed on the cheque.
5. User enters Amount Paid.
6. User optionally enters a Description (e.g. "Partial payment for slip SL-1040").
7. **Confirm Payment** button activates only when client + phone are verified and amount > 0.
8. User clicks **Confirm Payment**.
9. System saves the payment record (including description, collection date, cheque date if applicable). Form clears. Success banner appears.
10. The "Recorded Payments" table below the form updates to include the new entry.

### UC-31 View Weekly Payment Records
**Trigger:** User navigates to **Payment → Weekly** tab.
**Steps:**
1. System shows all payments from the current calendar week.
2. User can search by client name, phone, or payment method.
3. Header displays week date range and Total Collected.

### UC-32 View Monthly Payment Records
**Trigger:** User navigates to **Payment → Monthly** tab.
**Steps:**
1. User selects a month using the month picker.
2. User can search by client name, phone, or payment method.
3. System shows filtered payments with count and Total Collected footer.

---

## Module 11 — Articles (Inventory)

### UC-33 Add a New Article
**Trigger:** User navigates to **Production → Daily** → clicks **+ New Article**.
**Steps:**
1. A modal dialog appears.
2. User enters Article Name (required), Color, Size, and Opening Quantity.
3. User clicks **Add Article**.
4. System adds the article to inventory. Modal closes.

### UC-36 Delete an Article from Inventory
**Trigger:** User clicks the ✕ button on any article row on the **Stock** page.
**Steps:**
1. Browser confirmation dialog asks: "Remove [Article Name] from inventory? This cannot be undone."
2. On confirm: article is permanently removed from the articles array.
3. Article disappears from the Stock page, New Sale article dropdown, and Production daily entry list.
4. Any existing slips that referenced that article are unaffected (historical records preserved).

---

## Cross-Cutting Use Cases

### UC-34 Print Any Report or Invoice
**Trigger:** User clicks "Print" / "Print Report" / "Print Production" button in the header.
**Steps:**
1. Sidebar, header, and all `[data-no-print]` controls are hidden.
2. Browser print dialog opens.
3. Output is a clean, compact document suitable for printing or saving as PDF.

### UC-35 Search / Filter Records
**Trigger:** Any search input is available on the current screen.
**Behaviour:** All filtering is real-time (no submit required). Matches are case-insensitive. Empty search shows all records.

| Screen | Search scope |
|---|---|
| Stock | Article name |
| Slips → Clients | Client name |
| Payment → Weekly | Client name, phone, or method |
| Payment → Monthly | Client name, phone, or method |
| Chemical → History | Date string or month |
| Chemical → Usage | Date string or month |
