import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { normalizeIp } from './botblock.js';

// Live chat for the Virtual Con (§11). Gated to Digital-ticket holders (stream
// entitlement token) and staff (admin/editor session cookie). Messages are
// persisted (for moderation/history) and broadcast to the room. Single-process
// in-memory fan-out — for multi-instance, front it with a Redis pub/sub.

const ROOM = 'virtual';
const HISTORY = 50;
const MAX_BODY = 500;
const MAX_HANDLE = 32;
const RATE = { max: 5, windowMs: 10_000 };
const PROFANITY = [/fuck\w*/gi, /shit\w*/gi, /bitch\w*/gi, /\bcunt\w*/gi, /nigg\w*/gi, /\bfag\w*/gi];

const clients = new Set(); // { ws, role, handle, ip, times: [] }

function clean(s, max) {
  // eslint-disable-next-line no-control-regex
  return String(s ?? "").replace(/[<>\x00-\x1f]/g, "").trim().slice(0, max);
}
function maskProfanity(s) {
  let out = s;
  for (const re of PROFANITY) out = out.replace(re, (m) => '*'.repeat(m.length));
  return out;
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const c of clients) {
    if (c.ws.readyState === 1) c.ws.send(data);
  }
}

/** Authenticate an upgrade: returns { role } or null. */
function authenticate(req) {
  // Staff via the session access-token cookie (sent on the same-origin upgrade).
  const rawCookie = req.headers.cookie || '';
  const access = rawCookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  if (access) {
    try {
      const payload = jwt.verify(decodeURIComponent(access[1]), env.JWT_SECRET);
      if (['admin', 'editor', 'door_staff'].includes(payload.role)) return { role: 'staff' };
    } catch { /* fall through */ }
  }
  // Viewer via stream entitlement token (?token=…).
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      if (payload.typ === 'stream') return { role: 'viewer' };
    } catch { /* fall through */ }
  }
  return null;
}

export async function recentMessages() {
  const { rows } = await query(
    `SELECT id, handle, body, role, created_at FROM chat_messages
      WHERE room=$1 AND NOT is_hidden ORDER BY created_at DESC LIMIT $2`,
    [ROOM, HISTORY],
  );
  return rows.reverse();
}

/** Broadcast a moderation hide so connected clients drop the message live. */
export function broadcastHide(id) {
  broadcast({ type: 'hide', id });
}

export function attachChat(server) {
  const wss = new WebSocketServer({ server, path: '/ws/chat' });

  wss.on('connection', async (ws, req) => {
    const auth = authenticate(req);
    if (!auth) {
      ws.close(4401, 'unauthorized');
      return;
    }
    const ip = normalizeIp(req.socket.remoteAddress);
    const client = { ws, role: auth.role, handle: null, ip, times: [] };
    clients.add(client);

    // Send recent history on join.
    try {
      ws.send(JSON.stringify({ type: 'history', messages: await recentMessages() }));
    } catch { /* ignore */ }

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString().slice(0, 2000)); } catch { return; }
      if (msg.type !== 'msg') return;

      // Rate limit per connection.
      const now = Date.now();
      client.times = client.times.filter((t) => now - t < RATE.windowMs);
      if (client.times.length >= RATE.max) {
        ws.send(JSON.stringify({ type: 'error', error: 'You are sending messages too fast.' }));
        return;
      }
      client.times.push(now);

      const handle = clean(msg.handle, MAX_HANDLE) || 'Guest';
      const body = maskProfanity(clean(msg.body, MAX_BODY));
      if (!body) return;
      client.handle = handle;

      try {
        const { rows } = await query(
          `INSERT INTO chat_messages (room, handle, body, role, ip)
           VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
          [ROOM, handle, body, client.role === 'staff' ? 'staff' : 'viewer', ip],
        );
        broadcast({ type: 'msg', id: rows[0].id, handle, body, role: client.role === 'staff' ? 'staff' : 'viewer', at: rows[0].created_at });
      } catch {
        /* never crash the socket on a bad write */
      }
    });

    ws.on('close', () => clients.delete(client));
    ws.on('error', () => clients.delete(client));
  });

  // Heartbeat: drop dead connections.
  const ping = setInterval(() => {
    for (const c of clients) {
      if (c.ws.readyState === 1) c.ws.ping();
    }
  }, 30_000);
  ping.unref?.();

  return wss;
}
