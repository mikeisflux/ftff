import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfig } from '../store/ConfigContext.jsx';

// EU/US cookie & privacy consent banner (§ compliance). Shown to every visitor
// until they Accept or Reject, then remembered in localStorage. Admin-togglable
// via the privacy.consent_banner_enabled setting (exposed in /public-config).
// Reject keeps only strictly-necessary cookies (the only kind we set by default),
// so honoring it requires no extra wiring today.
const STORAGE_KEY = 'ftff-consent-v1';

export default function ConsentBanner() {
  const { config } = useConfig();
  const [choice, setChoice] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return 'dismissed'; }
  });

  useEffect(() => {
    if (!choice) return;
    try { localStorage.setItem(STORAGE_KEY, choice); } catch { /* ignore */ }
  }, [choice]);

  // Wait for config; respect the admin toggle and a prior choice.
  if (!config || config.consentBannerEnabled === false) return null;
  if (choice) return null;

  return (
    <div className="consent-banner" role="dialog" aria-live="polite" aria-label="Cookie and privacy consent">
      <div className="consent-text">
        We use cookies to run this site, keep it secure, and—if you agree—remember your
        preferences. See our{' '}
        <Link to="/cookie-policy">Cookie Notice</Link> and{' '}
        <Link to="/privacy-policy">Privacy Policy</Link>.
      </div>
      <div className="consent-actions">
        <button className="btn secondary" onClick={() => setChoice('rejected')}>Reject non-essential</button>
        <button className="btn" onClick={() => setChoice('accepted')}>Accept all</button>
      </div>
    </div>
  );
}
