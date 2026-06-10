import { query, withTransaction } from '../db/pool.js';
import { release as releaseInventory } from '../lib/inventory.js';
import { sendBalanceInvoice } from '../lib/exhibitorBalance.js';

// Days before show set-up that the balance auto-reminder goes out. Set-up is the
// day before the show opens, so the reminder window starts (starts_on - 1 - 30).
const BALANCE_LEAD_DAYS = 30;

// Release expired exhibitor holds: unpaid applications whose hold window lapsed
// get their booth + reserved tables returned to the pool. Deposit-paid apps are
// never touched (their space is secured).
export async function releaseExpiredExhibitorHolds() {
  const { rows } = await query(
    `SELECT id FROM exhibitor_applications
      WHERE status IN ('awaiting_payment','check_pending')
        AND hold_until IS NOT NULL AND hold_until < now()`,
  );
  let released = 0;
  for (const { id } of rows) {
    // Each release is one transaction with the app row locked FOR UPDATE — the
    // payment webhook locks the same row, so a payment landing right at the
    // hold boundary either commits first (re-check below skips the app) or
    // waits until the release commits. Without this, the old code could mark a
    // just-paid application 'cancelled' and double-release its tables.
    await withTransaction(async (client) => {
      const { rows: r } = await client.query(
        `SELECT id, booth_id, reserved_tables, status, hold_until
           FROM exhibitor_applications WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const a = r[0];
      if (!a || !['awaiting_payment', 'check_pending'].includes(a.status)
          || !a.hold_until || new Date(a.hold_until) > new Date()) {
        return; // paid or otherwise changed since the scan — leave it alone
      }
      if (a.reserved_tables > 0) await releaseInventory('extra_tables', a.reserved_tables, client);
      if (a.booth_id) {
        await client.query(
          `UPDATE booths SET status='available', held_until=NULL WHERE id=$1 AND status<>'sold'`,
          [a.booth_id],
        );
      }
      await client.query(
        `UPDATE exhibitor_applications SET status='cancelled', reserved_tables=0, hold_until=NULL
          WHERE id=$1`,
        [a.id],
      );
      released += 1;
    }).catch((err) => console.error(`Hold release failed for ${id}:`, err.message));
  }
  if (released > 0) console.log(`Released ${released} expired exhibitor hold(s).`);
  return released;
}

// Automatically email a balance invoice to deposit-only exhibitors once the show
// is within the lead window. Idempotent: balance_request_sent_at gates resends.
export async function autoSendExhibitorBalances() {
  const { rows: info } = await query(`SELECT starts_on FROM show_info LIMIT 1`);
  const startsOn = info[0]?.starts_on;
  if (!startsOn) return 0;
  const setup = new Date(startsOn);
  setup.setDate(setup.getDate() - 1); // set-up day = day before doors
  const windowOpens = new Date(setup);
  windowOpens.setDate(windowOpens.getDate() - BALANCE_LEAD_DAYS);
  if (Date.now() < windowOpens.getTime()) return 0; // not yet in the reminder window

  const { rows } = await query(
    `SELECT * FROM exhibitor_applications
      WHERE status='deposit_paid' AND balance_cents > 0 AND balance_request_sent_at IS NULL`,
  );
  let sent = 0;
  for (const app of rows) {
    // Claim the send BEFORE emailing (conditional update). Overlapping runs —
    // or multiple workers, if this ever runs clustered — can't double-send: only
    // one claim succeeds. On failure the claim is returned for the next run.
    const claim = await query(
      `UPDATE exhibitor_applications SET balance_request_sent_at = now()
        WHERE id = $1 AND balance_request_sent_at IS NULL AND status = 'deposit_paid'
        RETURNING id`,
      [app.id],
    );
    if (claim.rowCount === 0) continue;
    try {
      await sendBalanceInvoice(app);
      sent += 1;
    } catch (err) {
      // Stripe not configured yet, etc. — release the claim for the next run.
      await query(
        `UPDATE exhibitor_applications SET balance_request_sent_at = NULL WHERE id = $1`,
        [app.id],
      ).catch(() => {});
      console.error(`Auto balance invoice skipped for ${app.reference}:`, err.message);
    }
  }
  if (sent > 0) console.log(`Auto-sent ${sent} exhibitor balance invoice(s).`);
  return sent;
}

let holdTimer = null;
let balanceTimer = null;
export function startExhibitorJobs() {
  if (!holdTimer) {
    holdTimer = setInterval(() => {
      releaseExpiredExhibitorHolds().catch((err) => console.error('releaseExpiredExhibitorHolds failed:', err.message));
    }, 60_000);
    holdTimer.unref?.();
  }
  if (!balanceTimer) {
    balanceTimer = setInterval(() => {
      autoSendExhibitorBalances().catch((err) => console.error('autoSendExhibitorBalances failed:', err.message));
    }, 6 * 60 * 60_000); // every 6 hours
    balanceTimer.unref?.();
    // Kick once shortly after boot.
    setTimeout(() => autoSendExhibitorBalances().catch(() => {}), 30_000).unref?.();
  }
}
