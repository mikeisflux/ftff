import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useConfig } from '../store/ConfigContext.jsx';
import { computeExhibitorPricing, money, PRICES } from '../lib/exhibitorPricing.js';
import { EXHIBITOR_TERMS, EXHIBITOR_TERMS_TITLE } from '../content/exhibitorTerms.js';
import BoothPicker from '../components/BoothPicker.jsx';

const BLANK = {
  vendor_name: '', product_desc: '', num_attendees: '',
  company_name: '', address: '', contact_name: '', contact_email: '', contact_phone: '',
  website: '', category: '',
  hotel_night1: false, hotel_night2: false, hotel_night3: false,
  extra_tables: 0, additional_request: '',
  livestreaming: false, livestream_panel: false, panel_name: '', panel_day: '',
  banquet: false, banquet_chicken: 0, banquet_beef: 0, banquet_vegan: 0, dietary: '',
  signature: '',
};

const MEALS = [
  ['banquet_chicken', 'Meyer Lemon Butter-Crusted Chicken Breast', 'Quinoa salad, caramelized Brussels sprouts with pistachios and dried cherries, chicken jus'],
  ['banquet_beef', 'Filet of Beef with Worcestershire & Herb Butter', 'Horseradish-scented Yukon mash, jumbo asparagus, caramelized red pearl onions, Burgundy wine sauce'],
  ['banquet_vegan', 'Vegan Option', 'Chef’s seasonal plant-based plate'],
];

export default function BecomeExhibitor() {
  const { getRecaptchaToken } = useConfig();
  const [step, setStep] = useState('form'); // form | pay | done
  const [form, setForm] = useState(BLANK);
  const [agreed, setAgreed] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // pay step
  const [booth, setBooth] = useState(null);
  const [choice, setChoice] = useState('deposit');
  const [method, setMethod] = useState('card');

  const cfg = useQuery({ queryKey: ['exhibitor-config'], queryFn: () => api('/exhibitor/config') });
  const tablesAvailable = cfg.data?.tablesAvailable ?? 0;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setNum = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/[^0-9]/g, '') }));
  const toggle = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));

  const pricing = useMemo(() => computeExhibitorPricing(form), [form]);

  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  async function submitApplication(e) {
    e.preventDefault();
    setError('');
    if (!form.vendor_name.trim()) return setError('Please enter your vendor name.');
    if (!form.contact_email.trim()) return setError('Please enter a contact email.');
    if (!form.signature.trim()) return setError('Please type your signature to agree.');
    if (!agreed) return setError('You must agree to the Terms and Conditions.');
    if (pricing.extraTables > tablesAvailable) return setError(`Only ${tablesAvailable} additional tables remain.`);

    setBusy(true);
    try {
      const recaptchaToken = await getRecaptchaToken('exhibitor');
      const body = {
        ...form,
        num_attendees: form.num_attendees === '' ? null : Number(form.num_attendees),
        extra_tables: Number(form.extra_tables) || 0,
        banquet_chicken: Number(form.banquet_chicken) || 0,
        banquet_beef: Number(form.banquet_beef) || 0,
        banquet_vegan: Number(form.banquet_vegan) || 0,
        agreed: true,
        ...(recaptchaToken ? { recaptchaToken } : {}),
      };
      const res = await api('/exhibitor/apply', { method: 'POST', body });
      setResult(res);
      setStep('pay');
    } catch (err) {
      setError(err.data?.details?.[0]?.message || err.message || 'Could not submit your application.');
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    setError('');
    if (!booth) return setError('Please select a booth on the floor plan.');
    setBusy(true);
    try {
      const res = await api('/exhibitor/checkout', {
        method: 'POST',
        body: { applicationId: result.applicationId, boothId: booth.id, choice, method },
      });
      if (res.url) { window.location.assign(res.url); return; }
      if (res.method === 'check') { setStep('done'); return; }
    } catch (err) {
      setError(
        err.data?.code === 'booth_unavailable' ? 'That booth was just taken — pick another.'
        : err.data?.code === 'tables_unavailable' ? 'Not enough additional tables remain for your order.'
        : err.data?.code === 'stripe_unconfigured' ? 'Card payments aren’t enabled yet — choose “Pay by check.”'
        : err.message || 'Could not start checkout.',
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Confirmation (check) ────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="section container" style={{ maxWidth: 720 }}>
        <h1 className="glow">Application received</h1>
        <div className="card">
          <p style={{ color: 'var(--color-success)' }}>✓ Thanks! Your application <strong>{result?.reference}</strong> is in.</p>
          <p>You chose to pay by check. Make your check or money order payable to <strong>Undeniable Ventures</strong> and mail it to <strong>6 Pilgrim Drive, Succasunna NJ 07876</strong>. Your booth is held for you and we’ll confirm once payment is received.</p>
        </div>
      </div>
    );
  }

  // ── Payment / booth selection step ──────────────────────────────────────────
  if (step === 'pay') {
    const amount = choice === 'deposit' ? result.depositCents : result.totalCents;
    return (
      <div className="section container" style={{ maxWidth: 1000 }}>
        <h1 className="glow">Reserve your booth</h1>
        <p className="muted">Application <strong>{result.reference}</strong> — pick a booth, then choose how to pay.</p>

        <div className="grid" style={{ gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
          <div>
            <BoothPicker selectedId={booth?.id} onSelect={setBooth} />
          </div>

          <div className="card" style={{ position: 'sticky', top: 90 }}>
            <h3 style={{ marginTop: 0 }}>Order summary</h3>
            <ul style={{ paddingLeft: 18 }}>
              {result.breakdown.map((l) => (
                <li key={l.key}>{l.qty} × {l.label} — {money(l.amountCents)}</li>
              ))}
            </ul>
            <p><strong>Total: {money(result.totalCents)}</strong></p>
            <p className="muted">Booth: {booth ? `${booth.label}${booth.zone ? ` (${booth.zone})` : ''}` : 'none selected'}</p>

            <h4>How much to pay now</h4>
            <label style={{ display: 'block' }}>
              <input type="radio" name="choice" checked={choice === 'deposit'} onChange={() => setChoice('deposit')} />{' '}
              Deposit — {money(result.depositCents)} <span className="muted">(balance {money(result.balanceCents)} later)</span>
            </label>
            <label style={{ display: 'block' }}>
              <input type="radio" name="choice" checked={choice === 'full'} onChange={() => setChoice('full')} />{' '}
              Pay in full — {money(result.totalCents)}
            </label>

            <h4>Payment method</h4>
            <label style={{ display: 'block' }}>
              <input type="radio" name="method" checked={method === 'card'} onChange={() => setMethod('card')} /> Credit card
            </label>
            <label style={{ display: 'block' }}>
              <input type="radio" name="method" checked={method === 'check'} onChange={() => setMethod('check')} /> Pay by check / money order
            </label>

            {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
            <button className="btn" style={{ marginTop: 12, width: '100%' }} disabled={busy || !booth} onClick={pay}>
              {busy ? 'Working…' : method === 'card' ? `Pay ${money(amount)}` : 'Reserve & pay by check'}
            </button>
            <button className="btn secondary" style={{ marginTop: 8, width: '100%' }} onClick={() => setStep('form')} disabled={busy}>
              Back to application
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Application form step ────────────────────────────────────────────────────
  return (
    <div className="section container" style={{ maxWidth: 980 }}>
      <h1 className="glow">Become an Exhibitor</h1>
      <p className="muted">Apply for exhibit space at For The Fans Fest — Harrah’s Resort Atlantic City, October 16–18, 2026.</p>

      <form onSubmit={submitApplication}>
        <div className="grid" style={{ gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Vendor basics */}
            <section className="card">
              <h3 style={{ marginTop: 0 }}>Vendor</h3>
              <label>Vendor name *</label>
              <input value={form.vendor_name} onChange={set('vendor_name')} required maxLength={200} />
              <label>Product / works of note</label>
              <input value={form.product_desc} onChange={set('product_desc')} maxLength={2000} />
              <label>Number of attendees working for you</label>
              <input value={form.num_attendees} onChange={setNum('num_attendees')} inputMode="numeric" />
            </section>

            {/* Hotel */}
            <section className="card">
              <h3 style={{ marginTop: 0 }}>1. Hotel stay</h3>
              <p className="muted">Select the nights you need a room. Choosing all three is the full stay.</p>
              <label style={{ display: 'block' }}><input type="checkbox" checked={form.hotel_night1} onChange={toggle('hotel_night1')} /> Night 1 — {money(PRICES.hotel.night1)}</label>
              <label style={{ display: 'block' }}><input type="checkbox" checked={form.hotel_night2} onChange={toggle('hotel_night2')} /> Night 2 — {money(PRICES.hotel.night2)}</label>
              <label style={{ display: 'block' }}><input type="checkbox" checked={form.hotel_night3} onChange={toggle('hotel_night3')} /> Night 3 — {money(PRICES.hotel.night3)}</label>
            </section>

            {/* Booth */}
            <section className="card">
              <h3 style={{ marginTop: 0 }}>2. Booth rental</h3>
              <p className="muted">
                Booths are {money(PRICES.boothBase)} (includes one table + 2 chairs). A nonrefundable deposit applies.
                Additional tables are {money(PRICES.extraTable)} each — <strong>{tablesAvailable}</strong> available.
              </p>
              <label>Additional tables needed</label>
              <input
                value={form.extra_tables}
                onChange={(e) => {
                  const n = Math.min(Number(e.target.value.replace(/[^0-9]/g, '') || 0), tablesAvailable);
                  setForm((f) => ({ ...f, extra_tables: n }));
                }}
                inputMode="numeric"
              />
            </section>

            {/* Additional requests */}
            <section className="card">
              <h3 style={{ marginTop: 0 }}>3. Additional requests</h3>
              <p className="muted">For event management (nothing is guaranteed).</p>
              <textarea rows={3} value={form.additional_request} onChange={set('additional_request')} maxLength={2000} />
            </section>

            {/* Live streaming */}
            <section className="card">
              <h3 style={{ marginTop: 0 }}>4. Live streaming</h3>
              <label style={{ display: 'block' }}><input type="checkbox" checked={form.livestreaming} onChange={toggle('livestreaming')} /> Will you be live streaming the event?</label>
              {form.livestreaming && (
                <>
                  <label style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={form.livestream_panel} onChange={toggle('livestream_panel')} /> Interested in committing to a livestream event panel?</label>
                  {form.livestream_panel && (
                    <div style={{ marginTop: 8 }}>
                      <label>Panel name</label>
                      <input value={form.panel_name} onChange={set('panel_name')} maxLength={200} />
                      <label>Day you want to do the panel</label>
                      <input value={form.panel_day} onChange={set('panel_day')} maxLength={60} />
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Banquet */}
            <section className="card">
              <h3 style={{ marginTop: 0 }}>5. Banquet</h3>
              <p className="muted">Limited seats. {money(PRICES.banquetPerPerson)} per person for attendance and meal — a three-course dinner.</p>
              <label style={{ display: 'block' }}><input type="checkbox" checked={form.banquet} onChange={toggle('banquet')} /> Will you attend the banquet?</label>
              {form.banquet && (
                <div style={{ marginTop: 10 }}>
                  <p className="muted">Enter how many of each meal:</p>
                  {MEALS.map(([key, name, desc]) => (
                    <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                      <input style={{ width: 64 }} value={form[key]} onChange={setNum(key)} inputMode="numeric" />
                      <div><strong>{name}</strong><br /><span className="muted" style={{ fontSize: '.85rem' }}>{desc}</span></div>
                    </div>
                  ))}
                  <p className="muted" style={{ fontSize: '.85rem' }}>
                    Also served: Sunset Beet Salad (GF, VG &amp; V) and Chocolate Espresso Tiramisu with mascarpone cream.
                  </p>
                  <label>Dietary requirements</label>
                  <input value={form.dietary} onChange={set('dietary')} maxLength={1000} />
                </div>
              )}
            </section>

            {/* Company / contact */}
            <section className="card">
              <h3 style={{ marginTop: 0 }}>Company &amp; contact</h3>
              <label>Company name</label>
              <input value={form.company_name} onChange={set('company_name')} maxLength={200} />
              <label>Address, City, State, Zip</label>
              <input value={form.address} onChange={set('address')} maxLength={400} />
              <label>Contact name and title</label>
              <input value={form.contact_name} onChange={set('contact_name')} maxLength={200} />
              <label>Contact email *</label>
              <input type="email" value={form.contact_email} onChange={set('contact_email')} required />
              <label>Contact phone number</label>
              <input value={form.contact_phone} onChange={set('contact_phone')} maxLength={40} />
              <label>Exhibitor website</label>
              <input value={form.website} onChange={set('website')} maxLength={300} />
              <label>Exhibitor category (what you’ll be showing / selling)</label>
              <input value={form.category} onChange={set('category')} maxLength={200} />
            </section>

            {/* Terms */}
            <section className="card">
              <h3 style={{ marginTop: 0 }}>{EXHIBITOR_TERMS_TITLE}</h3>
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)', borderRadius: 8, padding: '10px 14px', fontSize: '.85rem' }}>
                {EXHIBITOR_TERMS.map((p, i) => (
                  <p key={i} style={{ marginTop: i === 0 ? 0 : 10 }}>{p}</p>
                ))}
              </div>
              <label style={{ display: 'block', marginTop: 12 }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I agree to all of the terms and conditions set forth by management and hotel.
              </label>
              <label>Signature (type your full name) *</label>
              <input value={form.signature} onChange={set('signature')} maxLength={200} placeholder="Your full name" />
            </section>

            {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
            <button className="btn" disabled={busy} style={{ alignSelf: 'start' }}>
              {busy ? 'Submitting…' : 'Continue to booth & payment'}
            </button>
          </div>

          {/* Live total */}
          <aside className="card" style={{ position: 'sticky', top: 90 }}>
            <h3 style={{ marginTop: 0 }}>Your order</h3>
            <ul style={{ paddingLeft: 18 }}>
              {pricing.lineItems.map((l) => (
                <li key={l.key}>{l.qty} × {l.label} — {money(l.amountCents)}</li>
              ))}
            </ul>
            <hr />
            <p><strong>Total: {money(pricing.totalCents)}</strong></p>
            <p className="muted" style={{ fontSize: '.85rem' }}>
              Deposit to reserve: {money(pricing.depositCents)}<br />
              (50% of booth + 60% of add-ons; balance {money(pricing.balanceCents)} due before the show)
            </p>
          </aside>
        </div>
      </form>
    </div>
  );
}
