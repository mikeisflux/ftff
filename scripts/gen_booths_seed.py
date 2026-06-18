#!/usr/bin/env python3
"""Generate the 140-table Wildwood Ballroom booth seed from the approved
floor-map data and splice it into server/db/seed.sql (replacing the old sample
booths). Coordinates are normalized to 0-1 over the hall for the booths table's
CHECK constraints; the SVG map renders from the feet geometry in floormap.json.
"""
import json
import re

DATA = "docs/floor-plan/booths.json"
SEED = "server/db/seed.sql"
PRICE = {"standard": 35000, "featured": 50000}

d = json.load(open(DATA))
W = d["hall"]["width_ft"]
H = d["hall"]["depth_ft"]

rows = []
for b in d["booths"]:
    px = round(b["x_ft"] / W, 5)
    py = round(b["y_ft"] / H, 5)
    pw = round(b["w_ft"] / W, 5)
    ph = round(b["h_ft"] / H, 5)
    tier = b.get("price_tier", "standard")
    price = PRICE.get(tier, 35000)
    facing = b.get("facing", "")
    rows.append(
        f"  ('{b['id']}', '{tier}', {price}, {px}, {py}, {pw}, {ph}, '{tier}', '{facing}')"
    )

block = (
    "-- ── booths: 140 Wildwood Ballroom tables (from docs/floor-plan/booths.json)\n"
    "-- Normalized coords for the table's 0-1 CHECK; the SVG map renders from the\n"
    "-- feet geometry. Idempotent: refresh layout/tier/price but preserve sale state.\n"
    "-- Remove pre-existing sample booths (uppercase labels) that aren't sold.\n"
    "DELETE FROM booths WHERE label ~ '^[A-Z][0-9]+$' AND status <> 'sold';\n"
    "INSERT INTO booths (label, zone, price_cents, pos_x, pos_y, width, height, tier, facing) VALUES\n"
    + ",\n".join(rows)
    + "\nON CONFLICT (label) DO UPDATE SET\n"
    "  zone=EXCLUDED.zone, price_cents=EXCLUDED.price_cents, pos_x=EXCLUDED.pos_x,\n"
    "  pos_y=EXCLUDED.pos_y, width=EXCLUDED.width, height=EXCLUDED.height,\n"
    "  tier=EXCLUDED.tier, facing=EXCLUDED.facing;\n"
)

seed = open(SEED).read()
# Replace the old booths INSERT (from the INSERT line through its ON CONFLICT ...;)
pat = re.compile(
    r"INSERT INTO booths \(label, zone, price_cents, pos_x, pos_y, width, height\) VALUES.*?ON CONFLICT DO NOTHING;",
    re.S,
)
if not pat.search(seed):
    raise SystemExit("old booths INSERT block not found (already replaced?)")
seed = pat.sub(block.rstrip("\n"), seed)
open(SEED, "w").write(seed)
print(f"spliced {len(rows)} booths into {SEED}")
