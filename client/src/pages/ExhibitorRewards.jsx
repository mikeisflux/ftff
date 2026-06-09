import { useState } from 'react';
import { api } from '../lib/api.js';
import { useConfig } from '../store/ConfigContext.jsx';
import { money } from '../lib/exhibitorPricing.js';
import HeroCarousel from '../components/HeroCarousel.jsx';

const STEPS = [
  { img: '/retailers/share.png', title: 'Share', body: 'Grab your personal ticket link and post it everywhere — your socials, your storefront, your newsletter. Invite your fans to grab their passes and come see you at the show.' },
  { img: '/retailers/earn.png', title: 'Earn', body: 'Every time a fan buys their tickets through your link, you bank 5% of the sale as Fan Fest Cash — credit you can put straight toward your next booth.' },
  { img: '/retailers/redeem.png', title: 'Redeem', body: 'After the show wraps, we tally your Fan Fest Cash and apply it to your next booth booking. The more fans you bring, the more you save.' },
];

function StatementRow({ e }) {
  const sign = e.amount_cents >= 0 ? '+' : '−';
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
      <td style={{ padding: '6px 0' }}>{new Date(e.created_at).toLocaleDateString()}</td>
      <td style={{ textTransform: 'capitalize' }}>{e.type}</td>
      <td className="muted">{e.note}</td>
      <td style={{ textAlign: 'right', color: e.amount_cents >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
        {sign}{money(Math.abs(e.amount_cents))}
      </td>
    </tr>
  );
}

export default function ExhibitorRewards() {
  const { getRecaptchaToken } = useConfig();
  const [form, setForm] = useState({ name: '', email: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const [lookupEmail, setLookupEmail] = useState('');
  const [account, setAccount] = useState(null);
  const [lookupErr, setLookupErr] = useState('');

  async function enroll(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const recaptchaToken = await getRecaptchaToken('rewards');
      const res = await api('/rewards/enroll', { method: 'POST', body: { ...form, ...(recaptchaToken ? { recaptchaToken } : {}) } });
      setResult(res);
    } catch (err) {
      setError(err.message || 'Could not create your rewards link.');
    } finally {
      setBusy(false);
    }
  }

  async function lookup(e) {
    e.preventDefault();
    setLookupErr(''); setAccount(null);
    try {
      const res = await api('/rewards/lookup', { method: 'POST', body: { email: lookupEmail } });
      setAccount(res);
    } catch (err) {
      setLookupErr(err.data?.code === 'not_found' ? 'No rewards account found for that email yet.' : (err.message || 'Lookup failed.'));
    }
  }

  function copy() {
    navigator.clipboard?.writeText(result.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const slides = [{
    id: 0,
    image_url: '/retailers/hero-2.png',
    title: 'Exhibitor Rewards',
    subtitle: 'Bring your fans to the show and earn 5% back toward your next booth. Three easy steps.',
    cta_url: '/exhibitor-rewards',
    cta_label: 'Apply Now',
  }];

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle="Exhibitor Rewards" />

      <div className="section container">
        <p style={{ fontSize: '1.1rem', maxWidth: 820 }}>
          Every exhibitor deserves a reward — and that means you. Share your personal ticket link with your fans and
          earn <strong>5% back</strong> in Fan Fest Cash toward your next booth booking.
        </p>

        <div className="grid cols-3" style={{ marginTop: 16 }}>
          {STEPS.map((s) => (
            <div className="card" key={s.title} style={{ padding: 0, overflow: 'hidden' }}>
              <img src={s.img} alt={s.title} style={{ width: '100%', display: 'block' }} />
              <div style={{ padding: 20 }}>
                <h3 style={{ marginTop: 0 }}>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Enroll → get share link */}
      <div className="section container">
        <h2 className="glow">Get your rewards link</h2>
        {result ? (
          <div className="card" style={{ maxWidth: 640 }}>
            <p style={{ color: 'var(--color-success)' }}>✓ You’re in, {result.name || 'partner'}! Share this link with your fans:</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input readOnly value={result.link} style={{ flex: 1, minWidth: 240 }} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
            </div>
            <p className="muted" style={{ marginTop: 10 }}>
              Every ticket bought through this link earns you {result.ratePct}% back. Bookmark it and check your balance below anytime.
            </p>
          </div>
        ) : (
          <form className="card" style={{ maxWidth: 520 }} onSubmit={enroll}>
            <p className="muted">Tell us where to send your link and we’ll set up your rewards account.</p>
            <label>Name / business</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={200} />
            <label>Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
            {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
            <div style={{ marginTop: 12 }}>
              <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create my link'}</button>
            </div>
          </form>
        )}
      </div>

      {/* Balance lookup */}
      <div className="section container">
        <h2 className="glow">Check your balance</h2>
        <form className="card" style={{ maxWidth: 520 }} onSubmit={lookup}>
          <label>Email</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="email" value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} required style={{ flex: 1 }} />
            <button className="btn secondary">View</button>
          </div>
          {lookupErr && <p style={{ color: 'var(--color-danger)' }}>{lookupErr}</p>}
        </form>

        {account && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Fan Fest Cash — {money(account.balanceCents)} available</h3>
            <p className="muted">Lifetime earned {money(account.earnedCents)} · redeemed {money(account.redeemedCents)} · your link: {account.link}</p>
            {account.events.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                <thead><tr style={{ textAlign: 'left' }}><th>Date</th><th>Type</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>{account.events.map((e, i) => <StatementRow key={i} e={e} />)}</tbody>
              </table>
            ) : <p className="muted">No activity yet — share your link to start earning!</p>}
          </div>
        )}
      </div>
    </div>
  );
}
