// E2E for Become an Exhibitor (§9 extended): authoritative pricing + deposit
// math, oversell-safe table inventory, check-payment hold, and deposit
// fulfillment (tables committed, booth sold, balance computed). Card checkout
// hits Stripe's network API, so we exercise the fulfillment path directly.
import assert from 'node:assert';
import { pool } from '../src/db/pool.js';
import { computeExhibitorPricing } from '../src/lib/exhibitorPricing.js';
import { fulfillExhibitorSession } from '../src/lib/fulfillment.js';

const BASE = process.env.BASE || 'http://localhost:4000/api/v1';

async function apply(body) {
  const r = await fetch(`${BASE}/exhibitor/apply`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}
async function checkout(body) {
  const r = await fetch(`${BASE}/exhibitor/checkout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}
const poolRow = async () => (await pool.query(`SELECT * FROM inventory_pools WHERE key='extra_tables'`)).rows[0];

const baseForm = {
  vendor_name: 'Test Vendor', contact_email: 'vendor@test.local',
  signature: 'Test Vendor', agreed: true,
};

async function main() {
  // ── 1. Pricing + deposit math ──────────────────────────────────────────────
  const p = computeExhibitorPricing({
    hotel_night1: true, hotel_night2: true, hotel_night3: true,
    extra_tables: 2, banquet: true, banquet_chicken: 1, banquet_beef: 1,
  });
  // booth bucket: 25000 + 2*10000 = 45000; addons: 35297 hotel + 40000 banquet = 75297
  assert.equal(p.totalCents, 120297, 'total adds up');
  assert.equal(p.depositCents, 22500 + 45178, 'deposit = 50% booth + 60% add-ons');
  console.log('  ✓ pricing + deposit math (50% booth / 60% add-ons)');

  // Two available booths + a known table pool (1 table for sale).
  const booths = (await pool.query(`SELECT id FROM booths ORDER BY label LIMIT 2`)).rows;
  assert.ok(booths.length >= 2, 'need two booths seeded');
  await pool.query(`UPDATE booths SET status='available', held_until=NULL, order_id=NULL WHERE id = ANY($1)`, [booths.map((b) => b.id)]);
  await pool.query(`UPDATE inventory_pools SET total=1, reserved=0, sold=0 WHERE key='extra_tables'`);

  // ── 2. Hard cap: can't apply for more tables than exist ─────────────────────
  const over = await apply({ ...baseForm, extra_tables: 2 });
  assert.equal(over.status, 400, 'applying for more tables than offered is rejected');
  assert.equal(over.data?.code, 'tables_exceeded');
  console.log('  ✓ application rejects more tables than offered');

  // ── 3. Apply + check-payment checkout reserves the booth + table ────────────
  const a1 = await apply({ ...baseForm, extra_tables: 1 });
  assert.equal(a1.status, 201, 'application created');
  const co1 = await checkout({ applicationId: a1.data.applicationId, boothId: booths[0].id, choice: 'deposit', method: 'check' });
  assert.equal(co1.status, 200, 'check checkout succeeds');
  assert.equal(co1.data.method, 'check');
  let pr = await poolRow();
  assert.equal(pr.reserved, 1, 'table reserved');
  assert.equal(pr.total - pr.reserved - pr.sold, 0, 'no tables left');
  console.log('  ✓ check checkout holds booth + reserves table');

  // ── 4. Oversell safeguard: the next vendor can't get a table ────────────────
  const a2 = await apply({ ...baseForm, extra_tables: 1 });
  const co2 = await checkout({ applicationId: a2.data.applicationId, boothId: booths[1].id, choice: 'deposit', method: 'check' });
  assert.equal(co2.status, 409, 'second table request blocked');
  assert.equal(co2.data?.code, 'tables_unavailable');
  // The booth claimed in the rolled-back txn must be released too.
  const booth2 = (await pool.query(`SELECT status FROM booths WHERE id=$1`, [booths[1].id])).rows[0];
  assert.equal(booth2.status, 'available', 'booth released when table reservation fails (no partial hold)');
  console.log('  ✓ overselling tables is prevented (and booth not stranded)');

  // ── 5. Deposit fulfillment commits the table + sells the booth ──────────────
  const result = await fulfillExhibitorSession({
    metadata: { application_id: a1.data.applicationId, phase: 'deposit' },
    amount_total: a1.data.depositCents,
  });
  assert.equal(result.application.status, 'deposit_paid');
  assert.equal(result.application.balance_cents, a1.data.totalCents - a1.data.depositCents, 'balance recorded');
  pr = await poolRow();
  assert.equal(pr.sold, 1, 'table moved reserved -> sold');
  assert.equal(pr.reserved, 0, 'reservation cleared');
  const booth1 = (await pool.query(`SELECT status FROM booths WHERE id=$1`, [booths[0].id])).rows[0];
  assert.equal(booth1.status, 'sold', 'booth sold on deposit');

  // Idempotent replay.
  const replay = await fulfillExhibitorSession({
    metadata: { application_id: a1.data.applicationId, phase: 'deposit' },
    amount_total: a1.data.depositCents,
  });
  assert.equal(replay.alreadyPaid, true, 'replayed deposit is a no-op');
  console.log('  ✓ deposit fulfillment commits table, sells booth, is idempotent');

  console.log('\nALL EXHIBITOR-FLOW ASSERTIONS PASSED');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
