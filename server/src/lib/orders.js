import { query, withTransaction } from '../db/pool.js';
import { randomToken } from './crypto.js';
import { HttpError, badRequest } from './http.js';

// Order construction for ticket checkout (§15). Amounts are ALWAYS computed
// server-side from the database — the client never sets prices.

/**
 * Human-friendly, collision-resistant order number, e.g. FFF-LZ4K9P-A1B2.
 * Time component keeps numbers roughly sortable; the random suffix makes
 * same-millisecond collisions astronomically unlikely (UNIQUE enforces it).
 */
function makeOrderNumber() {
  const time = Date.now().toString(36).toUpperCase();
  return `FFF-${time}-${randomToken(2).toUpperCase()}`;
}

/**
 * Resolve a ticket cart [{ code, quantity }] into priced line items using the
 * authoritative ticket_types prices. Validates active + availability.
 * Returns { lines, subtotalCents, totalCents, currency }.
 */
export async function computeTicketOrder(items) {
  if (!Array.isArray(items) || items.length === 0) throw badRequest('Cart is empty');

  // Collapse duplicate codes and bound quantities.
  const wanted = new Map();
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!it.code || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      throw badRequest('Invalid cart item');
    }
    wanted.set(it.code, (wanted.get(it.code) || 0) + qty);
  }

  const codes = [...wanted.keys()];
  const { rows } = await query(
    `SELECT id, code, name, price_cents, currency, is_active, quantity_total, quantity_sold
       FROM ticket_types WHERE code = ANY($1)`,
    [codes],
  );
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));

  let subtotalCents = 0;
  let currency = null;
  const lines = [];
  for (const [code, quantity] of wanted) {
    const t = byCode[code];
    if (!t || !t.is_active) throw badRequest(`Ticket type unavailable: ${code}`);
    if (t.quantity_total != null && t.quantity_sold + quantity > t.quantity_total) {
      throw new HttpError(409, `Sold out: ${t.name}`, 'sold_out');
    }
    currency = currency || t.currency;
    subtotalCents += t.price_cents * quantity;
    lines.push({
      ticketTypeId: t.id,
      code,
      name: t.name,
      unitPriceCents: t.price_cents,
      quantity,
    });
  }

  // Single-currency for now (open item #7); no tax/shipping on tickets.
  return { lines, subtotalCents, totalCents: subtotalCents, currency: currency || 'usd' };
}

/**
 * Resolve a store cart [{ variantId, quantity }] into priced line items using
 * authoritative product/variant prices, validating active + inventory.
 * Returns { lines, subtotalCents, totalCents, currency }.
 */
export async function computeStoreOrder(items) {
  if (!Array.isArray(items) || items.length === 0) throw badRequest('Cart is empty');

  const wanted = new Map();
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!it.variantId || !Number.isInteger(qty) || qty < 1 || qty > 50) {
      throw badRequest('Invalid cart item');
    }
    wanted.set(it.variantId, (wanted.get(it.variantId) || 0) + qty);
  }

  const ids = [...wanted.keys()];
  const { rows } = await query(
    `SELECT v.id AS variant_id, v.price_cents AS variant_price, v.inventory,
            v.is_active AS variant_active, v.options,
            p.id AS product_id, p.title, p.price_cents AS product_price,
            p.currency, p.is_active AS product_active
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id = ANY($1)`,
    [ids],
  );
  const byId = Object.fromEntries(rows.map((r) => [r.variant_id, r]));

  let subtotalCents = 0;
  let currency = null;
  const lines = [];
  for (const [variantId, quantity] of wanted) {
    const v = byId[variantId];
    if (!v || !v.variant_active || !v.product_active) throw badRequest('Item unavailable');
    if (v.inventory < quantity) {
      throw new HttpError(409, `Only ${v.inventory} left of ${v.title}`, 'out_of_stock');
    }
    const unit = v.variant_price ?? v.product_price;
    currency = currency || v.currency;
    subtotalCents += unit * quantity;
    const opt = v.options && Object.keys(v.options).length
      ? ` (${Object.values(v.options).join(', ')})` : '';
    lines.push({
      productId: v.product_id,
      variantId,
      name: `${v.title}${opt}`,
      unitPriceCents: unit,
      quantity,
    });
  }
  return { lines, subtotalCents, totalCents: subtotalCents, currency: currency || 'usd' };
}

/** Create a pending store order + product order_items. Returns the order row. */
export async function createPendingStoreOrder({ customer, computed }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO orders (order_number, customer_name, customer_email, customer_phone,
                           kind, subtotal_cents, total_cents, currency, status)
       VALUES ($1,$2,$3,$4,'store',$5,$6,$7,'pending') RETURNING *`,
      [makeOrderNumber(), customer.name ?? null, customer.email, customer.phone ?? null,
        computed.subtotalCents, computed.totalCents, computed.currency],
    );
    const order = rows[0];
    for (const line of computed.lines) {
      await client.query(
        `INSERT INTO order_items (order_id, kind, product_id, variant_id, description,
                                  unit_price_cents, quantity)
         VALUES ($1,'product',$2,$3,$4,$5,$6)`,
        [order.id, line.productId, line.variantId, line.name, line.unitPriceCents, line.quantity],
      );
    }
    return order;
  });
}

/**
 * Create a pending order + ticket order_items in one transaction.
 * Returns the new order row.
 */
export async function createPendingTicketOrder({ customer, computed }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO orders (order_number, customer_name, customer_email, customer_phone,
                           kind, subtotal_cents, total_cents, currency, status)
       VALUES ($1, $2, $3, $4, 'ticket', $5, $6, $7, 'pending')
       RETURNING *`,
      [
        makeOrderNumber(),
        customer.name ?? null,
        customer.email,
        customer.phone ?? null,
        computed.subtotalCents,
        computed.totalCents,
        computed.currency,
      ],
    );
    const order = rows[0];
    for (const line of computed.lines) {
      await client.query(
        `INSERT INTO order_items (order_id, kind, ticket_type_id, description,
                                  unit_price_cents, quantity)
         VALUES ($1, 'ticket', $2, $3, $4, $5)`,
        [order.id, line.ticketTypeId, line.name, line.unitPriceCents, line.quantity],
      );
    }
    return order;
  });
}
