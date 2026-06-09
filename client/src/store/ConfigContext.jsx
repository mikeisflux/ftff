import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';

// Public, non-secret site config (§5, §7.0b). Loads reCAPTCHA v3 when a site key
// is configured and exposes getRecaptchaToken() for forms.
const ConfigCtx = createContext({ config: null, getRecaptchaToken: async () => undefined });
export const useConfig = () => useContext(ConfigCtx);

let recaptchaLoaded = null;
function loadRecaptcha(siteKey) {
  if (recaptchaLoaded) return recaptchaLoaded;
  recaptchaLoaded = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return recaptchaLoaded;
}

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api('/public-config')
      .then((cfg) => {
        setConfig(cfg);
        if (cfg.recaptchaSiteKey) loadRecaptcha(cfg.recaptchaSiteKey);
      })
      .catch(() => {});
  }, []);

  const getRecaptchaToken = useCallback(async (action = 'submit') => {
    const siteKey = config?.recaptchaSiteKey;
    if (!siteKey || !window.grecaptcha) return undefined;
    try {
      await loadRecaptcha(siteKey);
      await new Promise((r) => window.grecaptcha.ready(r));
      return await window.grecaptcha.execute(siteKey, { action });
    } catch {
      return undefined;
    }
  }, [config]);

  return <ConfigCtx.Provider value={{ config, getRecaptchaToken }}>{children}</ConfigCtx.Provider>;
}
