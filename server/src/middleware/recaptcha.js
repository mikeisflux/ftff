import { verifyRecaptcha } from '../lib/recaptcha.js';
import { forbidden } from '../lib/http.js';

// Guard public form/state-changing endpoints with reCAPTCHA (§7.2). The token
// is read from the body (`recaptchaToken`) or the `X-Recaptcha-Token` header.
export async function requireRecaptcha(req, _res, next) {
  try {
    const token = req.body?.recaptchaToken || req.get('x-recaptcha-token');
    const result = await verifyRecaptcha(token, req.ip);
    if (!result.ok) return next(forbidden('reCAPTCHA verification failed', 'recaptcha'));
    next();
  } catch (err) {
    next(err);
  }
}
