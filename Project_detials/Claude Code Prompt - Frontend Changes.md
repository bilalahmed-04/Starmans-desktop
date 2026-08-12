# Claude Code Prompt — Frontend Feature Implementation

> **Context:** This is an existing frontend-only billing and inventory management app for a shoe sole business called **Soleria Sole House**. The app is already built and functional. You are tasked with implementing 7 specific features. Do NOT change any existing pages, logic, or styling outside of what is described below.

---

## Administrator Name

Replace every instance of `"Ehsan Ali"` in the codebase with **`"Abdul Aziz"`**.

---

## Feature 1 — Home Page (New Nav Item + New Page)

### Sidebar
Add **"Home"** as the **first nav item** above "New Sale". Same style as all other nav items:
- Active: `background: #B08D57; color: #1B2A41; font-weight: 600`
- Inactive: `color: rgba(250,248,243,0.72); font-weight: 500`
- Padding: `10px 14px` | Margin: `3px 14px` | Border-radius: `7px`
- Clicking it navigates to the Home page

### After login, navigate to Home (not New Sale)

### Home Page Layout
Max-width: `860px`, `margin: 0 auto`, `padding: 32px`, `background: #FAF8F3`

#### Section 1 — Welcome Header
```
Welcome back, Abdul Aziz
```
- Font: Lora 600, 28px, `#1B2A41`
- Below: live date + time updating every second
  - Format: `Tuesday, 14 July 2026 — 04:22 AM`
  - Font: Inter 13px 400, `#86847c`
- Below date: gold rule — `height: 2px; width: 48px; background: #B08D57; margin: 12px 0 32px 0`

#### Section 2 — Stat Cards
Layout: `display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px`

Each card:
```
background: #ffffff (use CSS var for dark mode)
border: 1px solid #E3E0D8
border-radius: 10px
padding: 22px 20px
transition: transform .2s, box-shadow .2s
hover: transform: scale(1.04); box-shadow: 0 10px 28px rgba(27,42,65,.12)
```

**Card 1 — Today's Sales**
- Label: "TODAY'S SALES" — Inter 11px 600, UPPERCASE, `#86847c`, letter-spacing 0.6px
- Value: count of slips confirmed today — Lora 32px 600, `#1B2A41`
- Sub: "slips confirmed" — Inter 12px, `#a6a49c`

**Card 2 — Today's Revenue**
- Label: "TODAY'S REVENUE"
- Value: sum of today's slip totals in ₨ — Lora 32px 600, `#B08D57`
- Sub: "earned today"

**Card 3 — Total Clients**
- Label: "TOTAL CLIENTS"
- Value: total client count — Lora 32px 600, `#1B2A41`
- Sub: "registered clients"

**Card 4 — Low Stock Alert**
- Label: "LOW STOCK"
- Value: count of articles below threshold — Lora 32px 600, `#B3401F`
- Sub: "articles need restock"
- Entire card is clickable → navigates to Stock page
- Hover: also adds `border-color: #B3401F`

#### Section 3 — Recent Slips
`margin-top: 32px`

Card wrapper:
```
background: #ffffff
border: 1px solid #E3E0D8
border-radius: 10px
overflow: hidden
```

Header: "Recent Slips" — Lora 18px 600, `#1B2A41`, padding `18px 22px`, border-bottom `1px solid #E3E0D8`

Table columns: `90px 1fr 1fr 120px` — Date | Slip No | Client | Amount
- Header row: `background: #FAF8F3`, Inter 11px 600 UPPERCASE, `#86847c`, padding `10px 22px`
- Body rows: Inter 14px, `#2B2B2B`, padding `12px 22px`, divider `1px solid #F0EDE6`
- Amount: Lora 14px 600, `#B08D57`
- Show last **5 slips** sorted newest first across all clients

Empty state: "No slips yet" — Inter 13px, `#a6a49c`, centered, padding `32px`

---

## Feature 2 — Stat Cards Zoom on Hover

The 4 stat cards on the Home page scale up slightly on hover:
```css
transition: transform .2s, box-shadow .2s
hover: transform: scale(1.04); box-shadow: 0 10px 28px rgba(27,42,65,.12)
```
Low Stock card additionally: `border-color: #B3401F`

---

## Feature 3 — Dark Mode Toggle

Add a light/dark mode toggle button in the **top header bar**, on the right side (before any contextual action buttons).

### Toggle Button
- Size: 36×36px circle
- Border: `1px solid var(--s-border)`
- Background: `var(--s-surface)`
- Icon: 🌙 in light mode, ☀️ in dark mode
- Hover: `border-color: #B08D57`
- Clicking it toggles dark mode on/off

### Dark Theme CSS Variables
Add these when `[data-theme="dark"]` is applied to the root wrapper:

```css
[data-theme="dark"] {
  --s-bg: #0d1520;
  --s-surface: #162030;
  --s-surf-alt: #111a28;
  --s-border: #253448;
  --s-divider: #1a2a3a;
  --s-thick: #B08D57;
  --s-text: #d4cfc8;
  --s-text-sec: #7a8fa8;
  --s-text-muted: #4a6278;
  --s-heading: #eee8dd;
}
```

Apply `data-theme="light"` or `data-theme="dark"` to the root app wrapper element. All existing pages already use CSS variables so they will adapt automatically.

**Important:** Replace any hardcoded hex colors on the Home page cards/text/borders with CSS variables so they respond to the theme switch.

---

## Feature 4 — Login Page DotField Background

Add an animated canvas dot field behind the login card. It must:
- Cover the full login page background
- Be positioned `absolute; inset: 0; z-index: 0`
- The login card sits above it at `z-index: 1`
- Dots push away from the cursor within a radius of ~400px
- Dots near the cursor glow gold (`rgba(176,141,87,…)`)
- Dots animate on a loop — no sparkle, no wave

### DotField Canvas Parameters
```
dotSpacing: 18px
dotRadius: 1.5px
bulgeStrength: 70 (push distance)
cursorRadius: 450px
glowRadius: 160px
Base dot opacity: 0.28–0.38 (gradient left-to-right, gold to navy tint)
Glow opacity: 0.25–0.70 near cursor
```

Implement as a canvas element that fills 100% width/height. Track `mousemove` on `document`. Use `requestAnimationFrame` loop. Clean up listeners on unmount. The dots should have a warm-to-cool gradient across the X axis (gold left → navy right).

Do NOT add DotField to any other page.

---

## Feature 5 — Profit Analytics: Interactive Donut Charts

Replace the existing SVG pie charts on the **Profit → Analytics** tab with animated interactive donut charts.

### One donut for Monthly Breakdown, one for Annual Breakdown

### Donut Chart Specs
- Size: 220×220px
- Stroke width: 28px
- Rotate SVG −90° so first segment starts at 12 o'clock
- Background ring: `var(--s-border)` color, same stroke width
- Segments: `strokeLinecap: round`
- Colors: Operating Expenses `#B08D57` | Utility Bills `#4A7FC1` | Chemical `#3F7D58`

### Mount Animation
When the Analytics tab is entered, segments animate from `strokeDasharray: 0 circumference` to their final values. Stagger each segment by ~80ms. Duration: ~0.6–0.8s per segment with `cubic-bezier(.4,0,.2,1)`.

### Hover Interaction
- Hovering a segment or its legend row highlights that segment:
  - `stroke-width` increases by 5px
  - `filter: drop-shadow(0 0 10px [segment color])`
  - `transform: scale(1.04)` (transform-origin: center)
- Center of the donut shows:
  - Label (10px, UPPERCASE, `var(--s-text-sec)`)
  - Value in ₨ (Lora 17px 600, `var(--s-heading)`)
  - Percentage (12px, `var(--s-text-sec)`) — only when a segment is hovered
- Default center (no hover): "Expenses" label + total expenses value

### Legend (right of donut)
- Period label (Lora 15px, `var(--s-heading)`)
- Gross sales subtitle (Inter 12px, `var(--s-text-sec)`)
- Each segment row: colored square (11×11px, border-radius 3px) + label (12.5px 600) + value · percentage (11.5px)
- Hovering a legend row highlights the matching segment (mutual hover sync)
- Net Profit / Net Loss at bottom: 10px UPPERCASE label + Lora 26px 600 in gold (`#B08D57`) or red (`#B3401F`)

---

## Feature 6 — Donut Chart Mount Animation (same as Feature 5 detail above)

Already described in Feature 5. Confirm it triggers every time the user navigates to the Analytics tab (not just once on initial load).

---

## General Notes

- All new UI must use the existing CSS variable system (`--s-bg`, `--s-surface`, `--s-border`, `--s-heading`, `--s-text`, `--s-text-sec`, `--s-text-muted`, etc.)
- Fonts already loaded: **Lora** (500, 600, 700) and **Inter** (400, 500, 600) from Google Fonts
- Currency formatted as ₨ with thousand separators
- No new color values outside the existing palette:
  - Navy: `#1B2A41` | Gold: `#B08D57` | App BG: `#FAF8F3` | Surface: `#ffffff`
  - Border: `#E3E0D8` | Error: `#B3401F` | Success: `#3F7D58` | Blue: `#4A7FC1`
- Do not modify any existing page logic or styling outside the scope above
