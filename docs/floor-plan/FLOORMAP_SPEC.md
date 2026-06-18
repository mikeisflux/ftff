# Wildwood Floor Map — Interactive Table Selection (build spec)

Hand this file plus `booths.json` to Claude Code. Goal: an embeddable, clickable floor map where buyers pick one or more exhibitor tables, see live availability, and carry the selection into checkout. Source of truth for availability lives on the server, not the browser.

## 1. What we're building

A floor-plan widget for the convention's table sales. It renders the Wildwood Ballroom: two non-sellable rooms across the top, then a grid of 140 sellable tables. A buyer clicks tables to select them; selected tables are reserved (held) for a short window and added to their order at checkout. Two buyers must never be able to purchase the same table.

## 2. Data

`booths.json` is the canonical map. Top-level keys:

- `hall` — overall dimensions (251' × 197', feet).
- `render` — a ready SVG mapping (`viewBox`, origin, scale, and the exact `px = origin + ft * scale` formula) so the rendered map matches the approved layout. Use this; don't re-derive geometry.
- `booths[]` — the 140 sellable tables. Each: `id` (e.g. `a1`), `row` (`a`–`g`), `col` (`1`–`20`), `type` (`standard` | `featured`), `price_tier`, `x_ft/y_ft/w_ft/h_ft` (position + size in feet), `facing` (compass the table front points toward), `status` (`available` | `held` | `sold` | `blocked`).
- `rooms[]` — Room A and Room B as feet polygons. Render them; they are not part of table selection (mark bookable separately later if needed).
- `zones[]` — aisles/corridor/egress rectangles, draw-only context.

Row/column convention: row `a` is the featured row across the bottom (facing the rooms); rows `b`–`g` go upward. Columns run `1`–`20` left→right. Tables are 10' wide × 8' deep and hold a 6' table.

Tier counts: 120 standard (rows b–g), 20 featured (row a).

## 3. Rendering

- Draw one SVG using `render.viewBox`. Convert every feet coordinate with the supplied formula. Draw, in order: hall outline, zones (light fill), room polygons, then booth rects.
- Each booth rect carries its `id` and shows its label centered. Standard and featured tiers get distinct fills (featured = warmer/accent).
- The back-to-back pairs face opposite directions; you don't need to draw the facing, but keep `facing` available for the tooltip ("faces the main aisle" / "faces the rooms").
- Responsive: SVG scales to container width; support pinch/scroll zoom + pan on mobile since 140 cells are small on a phone. A zoomed-in default on small screens is fine.

## 4. Selection states & styling

Each booth is in exactly one visual state:

- `available` — selectable.
- `selected` — chosen by the current user (toggles on click/tap).
- `held` — reserved by someone else (or this user's pending cart); not selectable, visually muted.
- `sold` — taken; not selectable, distinct from held.
- `blocked` — admin-disabled (e.g. behind a pillar, reserved for staff); not selectable.

Click/tap an available booth to select; click a selected booth to deselect. Hover/long-press shows a tooltip: id, tier, price, facing. Support multi-select. Show a running tray ("3 tables selected — $X") with remove buttons and a "Proceed to checkout" action.

## 5. Availability & reservation (the part that must be right)

- The browser never decides what's available. On load, fetch current statuses from the server and merge onto `booths.json`.
- When a user selects tables and starts checkout, the server places a **hold** with a TTL (suggest 10–15 min). Held tables return `held` to everyone else immediately.
- Use optimistic UI but reconcile: if a hold fails (someone beat them to it), surface a clear "table just taken" message and refresh that cell.
- On purchase completion, holds convert to `sold`. On TTL expiry or abandoned cart, holds release back to `available`.
- Poll or use websockets/SSE to keep the open map reasonably live (every ~15–30s is fine for this scale).
- Server is authoritative at purchase time: re-validate that every table in the order is still held by that buyer before charging.

## 6. Pricing

- Two tiers today: `featured` (row a) and `standard` (rows b–g). Prices must be configurable server-side, not hard-coded. (Optionally support per-row or per-table overrides; corners/end-caps are common premium spots.)
- Line items at checkout should reference the table `id` so fulfillment knows exactly which space sold.

## 7. Checkout integration

Mike's stack runs Shopify alongside the IndiecrowdFund platform, so support either path via a thin adapter:

- **Shopify path:** map each table (or each tier) to a variant/SKU; selecting adds the variant to the cart with the table `id` as a line-item property; the hold is created when the cart is created and released if the cart is abandoned.
- **Platform path:** post selected ids to the orders API, which creates the hold and returns a checkout session.

Keep the map component decoupled: it emits `onSelectionChange(ids[])` and `onCheckout(ids[])`; the host app wires those to whichever backend.

## 8. Accessibility

- Every booth is a real button with `aria-label` ("Table a1, featured, $X, available"). Full keyboard navigation (arrow keys move across the grid by row/col, Enter toggles). Don't rely on color alone for state — add a pattern or icon for sold/held.
- Provide a non-visual fallback: a filterable list of tables (by row, tier, availability) that selects the same way, for screen readers and low-vision users.

## 9. Admin

- Toggle any table's status (`available`/`blocked`/`sold`), set tier prices, and export current sales as CSV (id, tier, status, buyer, price).
- Ability to add or relabel tables without a code change (the map is data-driven from `booths.json` + server status).

## 10. Acceptance criteria

1. Map renders all 140 tables in the correct positions with labels, plus Rooms A/B and aisles.
2. Selecting/deselecting works on desktop click and mobile tap; tray reflects selection and total.
3. Two concurrent sessions cannot hold or buy the same table; the loser sees a clear conflict message.
4. Holds expire and release automatically; completed purchases mark tables `sold` for everyone.
5. Prices are server-configurable per tier; checkout line items carry table ids.
6. Keyboard + screen-reader users can select and check out via the list fallback.

## 11. Out of scope / later

- Renting Rooms A/B as whole spaces (the polygons are in the data so it can be added).
- A short perimeter row along the side walls beside the corridor (extra tables past 140) — only if the venue's approved plan allows it.
- All aisle widths (10') and the room sizes are from the working layout; the **venue's fire-marshal-approved plan is the binding source** — confirm before selling, and reconcile `blocked` cells to whatever that plan dictates.
