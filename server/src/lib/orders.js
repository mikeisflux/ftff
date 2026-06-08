import { query, withTransaction } from '../db/pool.js';
import { randomToken } from './crypto.js';
import { HttpError, badRequest } from './http.js';

// Order construction for ticket checkout (§15). Amounts are ALWAYS computed
// server-side from the database — the client never sets prices.

/** Human-friendly unique order number, e.g. FX-7F3A9C2B. */
function makeOrderNumber() {
  return `FX-${randomToken(4).toUpperCase()}`;
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
