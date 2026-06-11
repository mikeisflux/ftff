import { Router } from 'express';

// Same-origin image proxy for our licensed hotel photos that live on third-party
// CDNs which block cross-site hotlinking (referrer checks). The server fetches
// the image and serves it from our own origin, so the browser never hotlinks.
//
// Locked to a fixed allowlist of hosts (no SSRF: https only, these CDNs only,
// and only image/* responses are returned).
export const imgProxyRouter = Router();

const ALLOWED_HOSTS = new Set([
  'www.caesars.com',
  'hotelmedia.s3.amazonaws.com',
  'images.trvl-media.com',
  'dynamic-media-cdn.tripadvisor.com',
  'cf.bstatic.com',
]);

imgProxyRouter.get('/', async (req, res) => {
  const raw = req.query.u;
  if (typeof raw !== 'string') return res.status(400).send('missing u');
  let url;
  try { url = new URL(raw); } catch { return res.status(400).send('bad url'); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    return res.status(403).send('host not allowed');
  }
  try {
    const upstream = await fetch(url, {
      redirect: 'follow',
      headers: {
        // Some CDNs serve only when the referer looks like the hotel's own site.
        'User-Agent': 'Mozilla/5.0 (compatible; ForTheFansFest/1.0)',
        Referer: `${url.protocol}//${url.hostname}/`,
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
    });
    if (!upstream.ok) return res.status(502).send('upstream error');
    const ct = upstream.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return res.status(415).send('not an image');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.send(buf);
  } catch {
    res.status(502).send('fetch failed');
  }
});
