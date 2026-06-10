// Standalone concurrency check (not part of the e2e runner): fires parallel
// checkouts at the last units of stock and asserts the transactional
// reservation in createPendingTicketOrder/createPendingStoreOrder lets exactly
// the available amount through. Run: node test/race-check.mjs (needs DATABASE_URL).
import assert from 'node:assert';
import { query, pool } from '../src/db/pool.js';
import { computeTicketOrder, createPendingTicketOrder, computeStoreOrder, createPendingStoreOrder } from '../src/lib/orders.js';

const customer = { name: 'Race Test', email: 'race@test.dev' };

async function cleanup() {
  await query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_email='race@test.dev')`);
  await query(`DELETE FROM orders WHERE customer_email='race@test.dev'`);
  await query(`DELETE FROM ticket_types WHERE code='RACETEST'`);
  await query(`DELETE FROM product_variants WHERE id IN (SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.slug='race-test-product')`);
  await query(`DELETE FROM products WHERE slug='race-test-product'`);
}

async function main() {
  await cleanup();

  // ── Tickets: 2 left, 6 concurrent buyers ───────────────────────────────────
  await query(
    `INSERT INTO ticket_types (code, name, price_cents, currency, is_active, quantity_total, quantity_sold)
     VALUES ('RACETEST','Race Test Pass',1000,'usd',TRUE,5,3)`,
  );
  const buyTicket = async () => {
    const computed = await computeTicketOrder([{ code: 'RACETEST', quantity: 1 }]);
    return createPendingTicketOrder({ customer, computed });
  };
  const ticketResults = await Promise.allSettled(Array.from({ length: 6 }, buyTicket));
  const tOk = ticketResults.filter((r) => r.status === 'fulfilled').length;
  const tSoldOut = ticketResults.filter((r) => r.status === 'rejected' && r.reason?.code === 'sold_out').length;
  console.log(`tickets: ${tOk} succeeded, ${tSoldOut} sold_out (want 2 / 4)`);
  assert.equal(tOk, 2, 'exactly the 2 available tickets reserved');
  assert.equal(tSoldOut, 4, 'the other 4 rejected as sold_out');

  // ── Store: 1 left, 4 concurrent buyers ─────────────────────────────────────
  const { rows: [prod] } = await query(
    `INSERT INTO products (slug, title, price_cents, currency, is_active)
     VALUES ('race-test-product','Race Test Product',500,'usd',TRUE) RETURNING id`,
  );
  const { rows: [variant] } = await query(
    `INSERT INTO product_variants (product_id, inventory, is_active) VALUES ($1, 1, TRUE) RETURNING id`,
    [prod.id],
  );
  const buyProduct = async () => {
    const computed = await computeStoreOrder([{ variantId: variant.id, quantity: 1 }]);
    return createPendingStoreOrder({ customer, computed });
  };
  const storeResults = await Promise.allSettled(Array.from({ length: 4 }, buyProduct));
  const sOk = storeResults.filter((r) => r.status === 'fulfilled').length;
  const sOut = storeResults.filter((r) => r.status === 'rejected' && r.reason?.code === 'out_of_stock').length;
  console.log(`store:   ${sOk} succeeded, ${sOut} out_of_stock (want 1 / 3)`);
  assert.equal(sOk, 1, 'exactly the 1 available unit reserved');
  assert.equal(sOut, 3, 'the other 3 rejected as out_of_stock');

  const unexpected = [...ticketResults, ...storeResults]
    .filter((r) => r.status === 'rejected' && !['sold_out', 'out_of_stock'].includes(r.reason?.code));
  if (unexpected.length) {
    console.error('Unexpected rejections:', unexpected.map((r) => r.reason?.message));
    process.exit(1);
  }

  await cleanup();
  console.log('ALL RACE-CHECK ASSERTIONS PASSED');
  await pool.end();
}

main().catch(async (err) => { console.error(err); await cleanup().catch(() => {}); process.exit(1); });
