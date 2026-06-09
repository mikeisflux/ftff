import { isBlockedCached, recordSuspicious } from '../lib/botblock.js';

// Per-request guard: short-circuit IPs the firewall has blocked (defense in
// depth — the kernel already drops them when iptables is active, but this also
// covers environments without NET_ADMIN). O(1) in-memory lookup.
export function botblockGuard(req, res, next) {
  if (isBlockedCached(req.ip)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Obvious vulnerability-scanner / bot probe paths. Hitting these is never
// legitimate traffic on this app, so each one is a heavy strike toward a block.
const PROBE_PATTERNS = [
  /\/wp-(login|admin|content|includes)/i,
  /\/xmlrpc\.php/i,
  /\.(php|asp|aspx|jsp|cgi)(\?|$)/i,
  /\/\.(env|git|aws|ssh|htpasswd)/i,
  /\/(phpmyadmin|adminer|vendor\/phpunit)/i,
  /\/wp-config|\/config\.(php|json|yml)/i,
];

export function botblockProbeDetector(req, _res, next) {
  const url = req.originalUrl || req.path;
  if (PROBE_PATTERNS.some((re) => re.test(url))) {
    // 3 strikes per probe — a couple of these and the IP is blocked.
    recordSuspicious(req, 'scanner_probe', { path: url, userAgent: req.get('user-agent') }, 3);
  }
  next();
}
