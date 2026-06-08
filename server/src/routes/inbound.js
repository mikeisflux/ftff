import express from 'express';
import multer from 'multer';
import { query } from '../db/pool.js';
import { getSettingValue } from '../lib/settings.js';
import { sanitizeHtml } from '../lib/sanitize.js';

// SendGrid Inbound Parse webhook (§12): SendGrid POSTs received email as
// multipart/form-data to this verified endpoint; we sanitize and store it in
// email_messages (folder=inbox) to power the Gmail-style admin client.
// Mounted BEFORE the JSON parser; multer handles the multipart body.
export const inboundRouter = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// "Display Name <user@example.com>" -> { email, name }
function parseAddress(raw) {
  if (!raw) return { email: null, name: null };
  const m = String(raw).match(/^\s*(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?/);
  if (!m) return { email: null, name: String(raw).trim() || null };
  return { name: (m[1] || '').trim() || null, email: m[2].toLowerCase() };
}

inboundRouter.post('/sendgrid-inbound', upload.any(), async (req, res) => {
  // Authenticity: if an inbound secret is configured, require it (passed as a
  // ?token= query param or X-Inbound-Token header on the Parse URL).
  const secret = await getSettingValue('sendgrid.inbound_webhook_secret');
  if (secret) {
    const provided = req.query.token || req.get('x-inbound-token');
    if (provided !== secret) return res.status(401).send('unauthorized');
  }

  const b = req.body || {};
  const from = parseAddress(b.from);
  const subject = b.subject || '(no subject)';
  const text = b.text || '';
  const html = sanitizeHtml(b.html || '');
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160);
  const attachments = (req.files || []).map((f) => ({
    filename: f.originalname,
    mime: f.mimetype,
    size: f.size,
    // Binary storage goes to object storage once configured; metadata for now.
  }));

  // Dedupe on the provider Message-ID header when available.
  const headers = b.headers || '';
  const msgIdMatch = headers.match(/^Message-ID:\s*(.+)$/im);
  const providerMsgId = msgIdMatch ? msgIdMatch[1].trim() : null;
  if (providerMsgId) {
    const dup = await query(`SELECT 1 FROM email_messages WHERE provider_msg_id=$1`, [providerMsgId]);
    if (dup.rowCount > 0) return res.json({ received: true, duplicate: true });
  }

  await query(
    `INSERT INTO email_messages
       (folder, direction, from_email, from_name, to_emails, subject, snippet,
        body_html, body_text, attachments, provider_msg_id)
     VALUES ('inbox','inbound',$1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      from.email, from.name, JSON.stringify(b.to ? [b.to] : []),
      subject, snippet, html, text, JSON.stringify(attachments), providerMsgId,
    ],
  );

  res.json({ received: true });
});
