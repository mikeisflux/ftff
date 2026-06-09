import { getSettingValue } from './settings.js';

// reCAPTCHA verification (§4.3, §7.2). Config-gated: if no secret is configured,
// verification is skipped so forms still work in dev / before setup. Supports
// both v2 (no score) and v3 (score threshold).
export async function verifyRecaptcha(token, ip) {
  const secret = await getSettingValue('recaptcha.secret');
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: 'missing_token' };

  const params = new URLSearchParams({ secret, response: token });
  if (ip) params.set('remoteip', ip);
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await res.json();
    const ok = data.success === true && (data.score === undefined || data.score >= 0.5);
    return { ok, score: data.score };
  } catch {
    return { ok: false, reason: 'verify_failed' };
  }
}
