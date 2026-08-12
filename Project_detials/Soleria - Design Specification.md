# Soleria Sole House — Design Specification

> **Purpose:** A complete visual and structural reference for the Soleria Billing app. A designer or developer can recreate every screen from scratch using only this document — no source file required.

---

## 1. Product Identity

| Property | Value |
|---|---|
| Product Name | **Soleria Sole House** |
| Tagline | *Inventory & billing for premium shoe soles. Calm, precise, and built for the counter.* |
| App Type | Desktop web application — full-viewport, no mobile breakpoints |
| Domain | Shoe sole inventory, billing, production, and payment management |
| Layout Model | Fixed sidebar (248 px) + scrollable main area |
| Minimum Viewport | ~1200 px wide |
| Currency | Pakistani Rupees (₨) — formatted with `toLocaleString('en-US')` thousand separators |

---

## 2. Color System

### 2.1 Brand Colors

| Role | Hex | Usage |
|---|---|---|
| Brand Navy | `#1B2A41` | Sidebar, dark CTAs, heavy borders, invoice dividers, total box |
| Brand Gold | `#B08D57` | Primary CTAs, active nav, monetary totals, accent lines, logo badge |
| App Background | `#FAF8F3` | Page background, table header rows, sidebar-adjacent areas |
| Card Surface | `#ffffff` | All content cards and panels |
| Alt Surface | `#F5F3EE` | Inactive tab buttons, secondary backgrounds |

### 2.2 Text Colors

| Role | Hex | Usage |
|---|---|---|
| Primary Text | `#2B2B2B` | Table cell values, body copy |
| Secondary Text | `#86847c` | Labels, metadata, descriptions |
| Muted Text | `#a6a49c` | Empty states, footer notes, disabled hints |
| Dark Heading | `#1B2A41` | Serif headings inside white cards |
| Gold Text | `#B08D57` | Amounts, totals, "View →" links, active nav |
| Error / Alert | `#B3401F` | Validation errors, delete actions, low-stock warnings |
| Success | `#3F7D58` | Confirmations, matched client, stock saved |

### 2.3 Borders & Dividers

| Role | Value |
|---|---|
| Standard Border | `1px solid #E3E0D8` |
| Table Row Divider | `1px solid #F0EDE6` |
| Section Separator (heavy) | `2px solid #1B2A41` |
| Sidebar Separator | `1px solid rgba(255,255,255,0.08)` |

### 2.4 Interactive States

| State | Rule |
|---|---|
| Input focus | `border-color: #B08D57; box-shadow: 0 0 0 3px rgba(176,141,87,0.15)` |
| Gold button hover | `background: #9c7a47` |
| Navy button hover | `background: #223350` |
| Client card hover | `box-shadow: 0 10px 26px rgba(27,42,65,0.10); border-color: #B08D57; transform: translateY(-2px)` |
| Delete button hover | `background: #FBF1ED; border-color: #B3401F` |
| Disabled button | `background: #E3E0D8; color: #9b988f; cursor: not-allowed` |

### 2.5 Semantic Banners

| Type | Background | Border | Text |
|---|---|---|---|
| Success | `#EEF4EF` | `#cfe0d4` | `#3F7D58` |
| Error | `#FBF1ED` | `#E8C5B8` | `#B3401F` |
| Info (editing) | `#ffffff` | left `3px solid #B08D57`, full `1px solid #B08D57` | `#1B2A41` |
| Verified (payment) | `#F0F7F3` | `#B8DFC9` | `#3F7D58` |

### 2.6 Login Panel Decorative Rings

Three concentric circles, absolute-positioned on the right side of the navy login panel:

| Ring | Size | Position | Border |
|---|---|---|---|
| Outer | 330 × 330 px | right −90 px, top −70 px | `1px solid rgba(176,141,87,0.32)` |
| Middle | 230 × 230 px | right −40 px, top −20 px | `1px solid rgba(176,141,87,0.24)` |
| Inner | 128 × 128 px | right 12 px, top 34 px | `1px solid rgba(176,141,87,0.16)` |

---

## 3. Typography

### 3.1 Typefaces

```
https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap
```

| Family | Role |
|---|---|
| **Lora** (serif) | Brand identity, page titles, monetary totals, report headers, invoice headings |
| **Inter** (sans-serif) | All UI chrome — nav, labels, buttons, body copy, inputs, table data |

### 3.2 Type Scale

| Element | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Login panel wordmark | Lora | 30 px | 600 | `#ffffff`, line-height 1.22 |
| Sidebar wordmark | Lora | 18 px | 600 | letter-spacing 0.5 px |
| Sidebar sub-label | Inter | 10.5 px | 400 | 1.6 px letter-spacing, UPPERCASE, `#B08D57` |
| Header brand mark | Lora | 12.5 px | 400 | 2.5 px letter-spacing, UPPERCASE |
| Page title (H1) | Lora | 24 px | 600 | `#1B2A41` |
| Card section heading | Lora | 16–22 px | 400–600 | `#1B2A41` |
| Invoice brand | Lora | 24 px | 600 | `#1B2A41` |
| Grand total (invoice) | Lora | 30 px | 600 | `#B08D57` |
| Report grand total | Lora | 26 px | 600 | `#B08D57` |
| Nav item (active) | Inter | 13.5 px | 600 | `#1B2A41` on gold bg |
| Nav item (inactive) | Inter | 13.5 px | 500 | `rgba(250,248,243,0.72)` |
| Table column header | Inter | 11 px | 600 | 0.6 px letter-spacing, UPPERCASE, `#86847c` |
| Table cell body | Inter | 13.5–14 px | 400–500 | `#2B2B2B` |
| Form label | Inter | 12 px | 600 | `#1B2A41` |
| Input text | Inter | 14 px | 400 | `#1B2A41` |
| Metadata / helper text | Inter | 11–12.5 px | 400 | `#86847c` |
| Button (all) | Inter | 13–15 px | 600 | varies by type |

---

## 4. Global Layout

### 4.1 Authenticated Shell

```
┌──────────────────────────────────────────────────────────────┐
│  SIDEBAR (248 px fixed)  │  HEADER (full width, 66 px tall)  │
│  bg: #1B2A41             │  bg: #FAF8F3                      │
│                          ├───────────────────────────────────┤
│  Logo block              │  MAIN CONTENT AREA                │
│  Nav items               │  flex: 1, overflow: auto          │
│                          │  padding: 32 px                   │
│  [admin footer]          │  bg: #FAF8F3                      │
└──────────────────────────┴───────────────────────────────────┘
Root: display:flex; height:100vh; width:100%; overflow:hidden
```

### 4.2 Header

- Height: 66 px | Background: `#FAF8F3` | `border-bottom: 1px solid #E3E0D8`
- Left → right: animated brand bar → vertical divider (1 × 26 px, `#E3E0D8`) → page H1 → spacer → contextual action button

**Animated gold bar (Solera Pulse):**
```css
@keyframes solera-pulse {
  0%, 100% { opacity: 0.45; transform: scaleX(0.8); }
  50%       { opacity: 1;    transform: scaleX(1);   }
}
/* Applied to: height:2px; background:#B08D57; transform-origin:left; animation: solera-pulse 2.8s ease-in-out infinite */
```

**Contextual header buttons** (appear per page):

| Page | Button | Style |
|---|---|---|
| New Sale (valid) | Confirm Sale | Gold primary |
| Slip Detail | Print | Gold primary |
| Slips/Expenses reports | Print Report / Print Expenses | Navy secondary |
| Production reports | Print Production | Navy secondary |
| Profit | Print Report | Navy secondary |

---

## 5. Sidebar

### 5.1 Logo Block (`padding: 24px 20px 16px`)
- Gold badge: 38 × 38 px, `border-radius: 9px`, `background: #B08D57`, letter "S" (Lora 700 20px, `#1B2A41`)
- "SOLERIA": Lora 600 18px, `#ffffff`, letter-spacing 0.5px
- "Sole House": Inter 10.5px, `#B08D57`, letter-spacing 1.6px, UPPERCASE

### 5.2 Navigation (`padding: 10px 0; flex: 1`)

Nine nav items (in order): **New Sale · Slips · Production · Stock · Bills · Chemical · Expenses · Profit · Payment**

Each item:
- Padding: `10px 14px` | Margin: `3px 14px` | Border-radius: `7px`
- Active: `background: #B08D57; color: #1B2A41; font-weight: 600`
- Inactive: `color: rgba(250,248,243,0.72); font-weight: 500`

### 5.3 Admin Footer (`padding: 14px 14px 16px; border-top: 1px solid rgba(255,255,255,0.08)`)
- Avatar: 36 × 36 px circle, `#B08D57`, initials "EA" (Inter 600 13px, `#1B2A41`)
- Name: Inter 13.5px 600, `#ffffff`
- Role: Inter 11px, `#B08D57`
- Chevron `⌄`: `rgba(255,255,255,0.5)`, 12px
- Row hover: `background: rgba(255,255,255,0.05)`

**Admin Popup** (slides in above footer):
- Background: `#22344f` | Border: `1px solid rgba(176,141,87,0.35)` | Border-radius: 9px
- Shadow: `0 14px 34px rgba(0,0,0,0.35)`
- Items: "Change Password", separator `1px solid rgba(255,255,255,0.08)`, "Log out" (`#d99a86`)

---

## 6. Buttons

| Type | Background | Color | Border | Padding | Radius |
|---|---|---|---|---|---|
| Primary (Gold) | `#B08D57` → hover `#9c7a47` | `#1B2A41` | none | `11px 28px` | 7px |
| Secondary (Navy) | `#1B2A41` → hover `#223350` | `#FAF8F3` | none | `10px 22px` | 7px |
| Dashed Outline | transparent | `#1B2A41` → hover `#B08D57` | `1px dashed #C9C4B8` → hover `#B08D57` | `8px 14px` | 6px |
| Dark Outline | transparent → hover `rgba(27,42,65,0.06)` | `#1B2A41` | `1px solid #1B2A41` | `8px 16px` | 6–7px |
| Danger Outline | transparent → hover `#FBF1ED` | `#B3401F` | `1px solid #E3E0D8` → hover `#B3401F` | `10px 18px` | 7px |
| Disabled | `#E3E0D8` | `#9b988f` | none | `11px 28px` | 7px |
| Method/Tag pill | `#F5F3EE` | `#1B2A41` | `1px solid #E3E0D8` | `3px 10px` | 20px |

---

## 7. Form Elements

### 7.1 Text / Number Input
```
border: 1px solid #E3E0D8
background: #ffffff
color: #1B2A41
padding: 9–10px 11–13px
border-radius: 6px
font: 14px Inter, sans-serif
outline: none
width: 100%; box-sizing: border-box
focus → border-color: #B08D57; box-shadow: 0 0 0 3px rgba(176,141,87,0.15)
```

### 7.2 Select / Dropdown
Same as text input + `cursor: pointer`.

### 7.3 Tab / Toggle Buttons (pill container)
- Container: `border: 1px solid #E3E0D8; border-radius: 8px; overflow: hidden`
- Active tab: `background: #1B2A41; color: #FAF8F3; font-weight: 600`
- Inactive tab: `background: #ffffff; color: #1B2A41; font-weight: 500`
- Each tab: `padding: 8px 18px; border: none; font: 13px Inter; cursor: pointer`

### 7.4 White Card Container
```
background: #ffffff
border: 1px solid #E3E0D8
border-radius: 10px
overflow: hidden
```

---

## 8. Screens

---

### 8.1 Login Screen

Full-viewport centered layout, `background: #FAF8F3`.

**Card:** 880 px wide, 2-column grid (`1fr 1fr`), `border-radius: 14px`, `overflow: hidden`, `box-shadow: 0 30px 70px rgba(27,42,65,0.14)`, min-height 440 px.

- **Left panel (navy):** padding 44px, flex column, space-between. Decorative rings (§2.6). Top: gold logo badge (56×56px). Bottom: wordmark + gold rule (2px × 46px) + tagline.
- **Right panel (form):** padding 48px 44px. "Welcome back" heading (Lora 23px) + subtitle + username + password inputs + error message + full-width gold "Log In" button + demo hint (centered, muted).

---

### 8.2 New Sale

Max-width 860 px, `margin: 0 auto`.

**Editing banner** (when editing existing slip): left-accent card, border `1px solid #B08D57`, left `3px solid #B08D57`.

**Sale Items Table** — white card, column grid `1fr 48px 74px 134px 80px 30px` (Article | Qty | Price ₨ | Discount | Total | Remove):
- Table header row: `background: #FAF8F3`
- Per row: article select + stock hint, qty input, price input, discount toggle (% / ₨) + value + hint, row total (right-aligned, Lora weight), remove button (26×26px, `#B3401F`)
- Per row sub-fields: Size input + Color input (1fr 1fr grid) + Description input (full width)
- Footer: dashed "+ Add Article" button

**Discount toggle pill:** `%` | `₨` — active: `background: #B08D57; color: #1B2A41`; inactive: `background: #F5F3EE; color: #86847c`

**Bottom row** (flex, gap 18px):
- Client card (flex: 1): white card, padding 18px — Client Name + Phone Number inputs side-by-side; existing-client green pill below
- Total box (240px wide): `background: #1B2A41; border-radius: 10px; padding: 20px 22px` — "TOTAL" label (Inter 11px, UPPERCASE, `rgba(250,248,243,0.55)`) + amount (Lora 30px 600, `#B08D57`)

---

### 8.3 Stock

Max-width 860 px. Search bar (220px). Info sub-heading. White card table — columns `1fr 110px 110px 80px 44px` (Article | Color | Size | In Stock | Remove).

- Low-stock label in `#B3401F` below article name. Stock qty: Inter 16px 700, color: normal `#2B2B2B`, low `#B3401F`.
- **Delete button:** 28×28px, `border-radius: 6px`, `border: 1px solid #E3E0D8`, transparent background, `#B3401F` ✕ glyph. Hover: `background: #FBF1ED; border-color: #B3401F`. Click shows browser confirm dialog; on confirm the article is permanently removed from the articles array and disappears from Stock, New Sale dropdown, and Production entry.

---

### 8.4 Slips

Max-width 1000 px. Three-tab pill bar: **Clients | Weekly Report | Monthly Report**.

**Clients tab:** Search input (max-width 280px). CSS grid of client cards (`repeat(auto-fill, minmax(220px,1fr))`). Each card: `background: #FAF8F3`, border, hover lift + gold border. Card shows name (Lora 16px), phone, order count, "View →" link.

**Weekly / Monthly Report tabs:** White card. Header with title + period (border-bottom `2px solid #1B2A41`). Column grid `90px 80px 1fr 1fr 110px` (Date | Slip No | Client | Articles | Amount). Footer stats: Slips count + Pairs Sold + Grand Total (Lora 26px, `#B08D57`).

---

### 8.5 Client Detail

Max-width 760 px. Back link "← All clients". Client name (Lora 26px) + phone + slip count. White card slip list — each row: slip number (Inter 14.5px 600) + date + items summary + total (Lora 16px 600, `#B08D57`) + Open / Edit / Delete buttons.

---

### 8.6 Slip Detail (Invoice)

Max-width 640 px. Optional confirmation banner (green). White card, `padding: 40px`.

**Invoice header:** Left — "SOLERIA" (Lora 24px 600) + "Sole House" (UPPERCASE, `#B08D57`) + address block. Right — Slip No, Ref, Date, Time.
Divider: `border-bottom: 2px solid #1B2A41`.

**Billed To:** Label (11px UPPERCASE `#86847c`) + client name (Inter 15px 600) + phone.

**Items table:** Column grid `1fr 60px 100px 110px` (Article | Qty | Unit Price | Amount). Each item: name + optional size/color meta (12px `#86847c`) + discount line (`#B3401F`) + description (italic, `#86847c`).

**Grand Total:** "GRAND TOTAL" label + amount (Lora 30px 600, `#B08D57`), right-aligned.

**Footer:** Dashed separator + "Thank you for your business" (Inter 12px, centered, `#a6a49c`).

**Action bar:** Print → New Sale / Edit → Delete → ← Back.

---

### 8.7 Expenses

Max-width 860 px. Four-tab pill bar: **New Entry | Weekly | Monthly | All Time**.

**New Entry:** White card, column grid `1fr 140px 36px` (Description | Amount ₨ | Remove). Footer row: dashed "+ Add Expense" + running total (Lora 18px). Confirm button + success message.

**Reports (Weekly / Monthly / All Time):** White card. Each entry group shows date/time header + subtotal (Lora 14px 600, `#B08D57`) + item rows (`1fr 120px` grid). Footer: "Total Expenses" + Lora 26px 600 `#B08D57`.

---

### 8.8 Production

Three-tab pill bar: **Daily | Weekly | Monthly**.

**Daily:** Date picker. Article list showing current stock. Qty-produced input per article. "Confirm Production" gold button + success message. Stock auto-increments on confirm.

**Weekly / Monthly:** White card reports. Column grid `1fr 110px 110px 130px` (Article | Color | Size | Produced). Footer: "Total Produced X pairs" (Lora 26px 600, `#B08D57`).

---

### 8.9 Bills

Two-tab pill bar: **Add Bills | All Bills**.

**Add Bills:** Date picker. White card — column grid `1fr 140px 36px` (Bill Name | Amount ₨ | Remove). Footer: running total + "Confirm Bills" gold button + success message.

**All Bills:** Grouped by month. Each month group: header with month name + total (border-bottom `2px solid #1B2A41`). Rows: bill name + amount. Month total footer.

---

### 8.10 Chemical

Three-tab pill bar: **Manage | Purchase History | Usage Log**.

**Manage:** Summary row — Total Purchased / Total Used / Remaining (3 stat boxes, white card). Below: two forms side-by-side — "Log Purchase" (date + qty kg + cost ₨) and "Log Daily Usage" (rows of date + qty). Both have gold Confirm buttons.

**Purchase History / Usage Log:** Grouped by month. Search/filter input. White card table. Totals in `#B08D57`.

---

### 8.11 Profit

Three-tab pill bar: **Monthly | Annual | Analytics**.

**Monthly:** Month navigator (← month-picker →). White card — Gross Sales, Expenses breakdown (Operating / Utility Bills / Chemical), Total Expenses, Net Profit (Lora 32px 600, green or red).

**Annual:** Year navigator (← year input →). White card table, columns `130px 1fr 1fr 1fr` (Month | Gross Sales | Expenses | Net Profit). Footer totals row.

**Analytics:** Year + Month dropdowns. Two pie charts (Monthly Breakdown + Annual Breakdown) with legend. SVG pie slices — Operating `#B08D57`, Bills `#4A7FC1`, Chemical `#3F7D58`. Net Profit displayed as Lora 28px.

---

### 8.12 Payment

Three-tab pill bar: **New Payment | Weekly | Monthly**.

**New Payment tab:** White card form.
1. Two-column grid: Client Name + Phone Number — real-time validation hints (green / red).
2. If client found + phone matches → green "Verified" card with initials avatar, name, phone, slip count.
3. Two-column grid: Payment Method select (Cash / Bank Transfer / Cheque / Online) + Amount Paid (₨) input.
4. **Cheque panel** (shown only when Cheque is selected): warm-tinted panel (`background: #FDFBF7; border: 1px solid #E3D9C6; border-radius: 8px; padding: 14px 16px`) with two fields side-by-side:
   - **Collection Date** — read-only display (`background: #F5F3EE`), auto-set to today by the system. Helper: "Auto-set to today — date you collected the cheque"
   - **Cheque Date** — user-editable date picker. Helper: "Date printed on the cheque"
5. **Description** (optional) — full-width text input. Placeholder: "e.g. Partial payment for slip SL-1040…"
6. Error banner (red) or success banner (green) after submit. Active/disabled Confirm button + Lora 20px amount preview beside it.

**Recorded Payments list** (below form on New Payment tab only): White card, columns `1fr 160px 130px 110px 120px` (Client | Phone | Date | Method | Amount). Shows all payments ever recorded.

**Weekly tab:** Search filter input. White card — same 5-column layout. Header shows week range + Total Collected (`#B08D57`). Empty state if no records.

**Monthly tab:** Search filter + month picker. Same white card layout. Footer: payment count + Total Collected (Lora 26px, `#B08D57`).

**Client validation rules:** Name must match an existing client exactly (case-insensitive). Phone must match the phone on that client's record exactly.

---

### 8.13 Settings

Max-width 520 px. White card. Username + Old Password + New Password fields. "Save Changes" gold button + inline success message.

---

## 9. Spacing System (8 px base grid)

| Value | Usage |
|---|---|
| 4 px | Icon-label gap, status dot |
| 6–8 px | Compact spacing, small padding |
| 10–12 px | Medium padding, button gaps |
| 14–16 px | Standard card padding, row padding |
| 18–20 px | Section padding, panel padding |
| 22–24 px | Section margin, header padding |
| 28–32 px | Report card padding, main content padding |
| 40–48 px | Invoice card padding, login panel padding |

---

## 10. Border Radius System

| Value | Elements |
|---|---|
| 5 px | Discount toggle buttons, inline tag toggles |
| 6 px | Inputs, small buttons, remove buttons |
| 7 px | All action buttons, nav items |
| 8 px | Tab containers, search inputs |
| 9 px | Admin popup, sidebar logo |
| 10 px | All content cards |
| 12 px | Modals |
| 13–14 px | Login panel logo / card |
| 20 px | Pills (client match, payment method tag) |
| 50 % | Avatars, status dots |

---

## 11. Elevation / Shadow

| Level | Value | Used on |
|---|---|---|
| Hover lift | `0 10px 26px rgba(27,42,65,0.10)` | Client cards |
| Popup | `0 14px 34px rgba(0,0,0,0.35)` | Admin popup |
| Login | `0 30px 70px rgba(27,42,65,0.14)` | Login card |
| Modal | `0 30px 70px rgba(27,42,65,0.22)` | New article modal |

---

## 12. Print Behavior

- `[data-no-print]` elements are `display: none !important` — hides sidebar, header, buttons, filters
- Body/html background forced to `#ffffff`
- `main` padding reduced to 8 px; all font sizes capped for compact receipt layout
- Lora serif headings restore at 14px; larger display sizes cap at 16px
- `@page { margin: 8mm }`

---

## 13. Demo Data

**Login:** `admin` / `admin` (pre-filled)

**Inventory articles (7):** PVC Sole, Rubber Sole, TPR Sole, Leather Sole, EVA Foam Sole *(low stock)*, Crepe Sole, PU Sole

**Clients (5):** Ahmed Footwear, Khan Shoe House, Malik Traders, Bilal Shoe Mart, Raza Brothers

**Slips:** 9 pre-loaded slips (SL-1035 through SL-1046) across June 2026

**Expenses:** 5 pre-loaded entries, June 2026

**Bills:** 5 entries across May–June 2026 (Electricity, Gas, Water, Internet, Shop Rent)

**Chemical purchases:** 2 entries, June 2026 (80 kg total)

**Chemical usage:** 7 daily entries, June 23–29 2026

**Payments:** Empty by default — user creates the first payment

**Low-stock threshold:** 20 pairs (tweakable in the Tweaks panel)

---

## 14. Design Principles

1. **Calm precision** — warm gold on deep navy; never neon or jarring.
2. **Serif for value, sans for function** — Lora exclusively on amounts, brand marks, headings. Inter handles everything operational.
3. **One accent color** — `#B08D57` gold is the only hue. The eye always knows where the action is.
4. **Print-first invoice** — Slip Detail is designed as a physical receipt, not a web page.
5. **No gratuitous decoration** — decorative elements limited to the three concentric rings on the login panel.
6. **Quiet feedback** — success states are small dots and pills. Errors appear inline. No modal dialogs for routine confirmations.
7. **Validation is live** — client name and phone fields validate in real time and surface colour-coded hints immediately.
