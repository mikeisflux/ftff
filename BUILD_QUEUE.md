# For The Fans Fest — Build Queue / Checklist

Living checklist of requested work so nothing is lost across sessions.
Status: ✅ done & pushed · 🔶 in progress · ⬜ todo

## Shipped this session (✅)
- ✅ 2-Day ticket tile + repoint multi-day pass
- ✅ Home hero reverted to single centered logo (removed auto-seeded slides)
- ✅ Per-guest detail pages (`/guests/:id`) + admin fields (pricing, days, bio link, socials)
- ✅ Guest bios kept off tiles (dropped from `/guests` list endpoint)
- ✅ Clickable guest tiles (homepage Featured + All Guests grid)
- ✅ Legal pages (Privacy, Terms, Refund, Cookie, Exhibitor/Booth)
- ✅ EU/US cookie consent banner + `/admin` settings toggle
- ✅ Per-hotel pages + galleries; real licensed photos via same-origin `/img-proxy`
- ✅ Per-guest Autograph/Photo-Op → add to cart (auto-created from pricing)
- ✅ Guest cover art: 3 admin uploads + centered bio tile + clickable full-screen lightbox
- ✅ `scripts/deploy.sh` (forces dev deps so the vite build actually runs)

## In progress (🔶)
- 🔶 Menu trim — **Shop**: only Buy Tickets · Room Rate Guarantee · Discounts and Coupons · Shop
- 🔶 Menu trim — **Attractions**: only Warlock Awards Banquet · Graham Nolan's Cigar Fest · Live Stream Panels · Gaming
- 🔶 **Vendors** public page: approved vendor names + booth numbers; A–Z jump bar; autocomplete search by vendor name
- 🔶 **Vendors admin** — full CRUD section in `/admin`
- 🔶 `vendors` table (schema) + public `/vendors` + admin `/admin/vendors`

## To do (⬜)
- ⬜ **Floor map / table picker** — integrate the 140-table Wildwood Ballroom SVG map from `files.zip` (`booths.json` + `FLOORMAP_SPEC.md`) INTO the existing `/floor-plan` (do not replace). Multi-select tables, live availability, server-authoritative, responsive pinch/zoom, a11y list fallback.
- ⬜ Seed the 140 tables (from `booths.json`) into the `booths` table (tier/facing, feet→normalized coords).
- ⬜ **Application-gated holds**: selecting a spot during the exhibitor application holds it; it stays held until the application is **approved** (→ table locked/sold permanently) or **rejected** (→ released). Replaces the short checkout-timer model.
- ⬜ **Admin approve/reject** for exhibitor applications (sets tables sold/available); add `pending_approval`/`approved`/`rejected` statuses.
- ⬜ Approved applications auto-create a **Vendors** directory entry (name + booth number).
- ⬜ **Slider dimensions** — document recommended image sizes (answered in chat; add to admin help text).
- ⬜ **Full mobile compatibility** — every feature usable on mobile; no functionality desktop-only (esp. floor map, admin, nav).
- ⬜ **Distinct phone and tablet layouts** — responsive breakpoints with tailored layouts for phone vs tablet across site + admin.

## Notes / decisions
- Deploy: `cd /opt/convention && git pull origin claude/optimistic-euler-jesbze && bash scripts/deploy.sh`
- `dist/` is git-ignored — the server only updates the frontend when `npm run build` actually runs (deploy.sh forces dev deps so it does).
- Hotel photos load through `/img-proxy` (allowlisted CDNs) to bypass hotlink blocking.
- "Room Rate Guarantee" Shop link currently points to `/travel-hotels` (confirm desired target/page).
