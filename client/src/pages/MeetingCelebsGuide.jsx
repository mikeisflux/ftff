import { useState } from 'react';
import { Link } from 'react-router-dom';
import HeroCarousel from '../components/HeroCarousel.jsx';

function Section({ id, image, title, children }) {
  return (
    <div id={id} className="info-row" style={{ alignItems: 'start', scrollMarginTop: 90 }}>
      <img src={image} alt={title} style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block' }} />
      <div>
        <h2 className="glow" style={{ marginTop: 0 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

const Tip = ({ label, children }) => (
  <p style={{ marginBottom: 14 }}><strong>{label}:</strong> {children}</p>
);

function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,.12)' }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, color: 'inherit', padding: '18px 0', fontSize: '1.05rem', fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        {q} <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && <p className="muted" style={{ paddingBottom: 18, marginTop: 0 }}>{a}</p>}
    </div>
  );
}

const FAQS = [
  { q: 'Do I need show admission to get an autograph, photo op, or selfie?', a: 'Yes — a valid For The Fans Fest ticket is required to enter the show, and then you can purchase autographs, photo ops, and other experiences once inside (or in advance where available).' },
  { q: 'Are photo ops and autographs included with my ticket?', a: 'No. Admission gets you into the show; autographs, photo ops, selfies, and special experiences are purchased separately. Some guests offer advance sales, which we recommend for popular stars.' },
  { q: 'Should I bring cash?', a: 'It’s smart to. Some guests handle autographs and selfies as cash transactions at their table. ATMs are available on-site if you need them.' },
  { q: 'Can I get a refund if a guest cancels?', a: 'Guest appearances are always subject to change. If a guest you purchased an experience with cancels, we’ll share refund or rescheduling details for that guest.' },
];

// Meeting Celebs Guide — original copy adapted to For The Fans Fest.
export default function MeetingCelebsGuide() {
  const slides = [{
    id: 0,
    image_url: '/retailers/hero-3.png',
    title: 'Meeting Your Faves',
    subtitle: "About to meet the stars you love? Don't panic — here's everything you need to make the moment unforgettable.",
    cta_url: '/all-guests',
    cta_label: 'See Guests',
  }];

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle="Meeting Celebs Guide" />

      <div className="section container" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#autographs" className="btn">Autographs</a>
          <a href="#photo-ops" className="btn">Photo Ops</a>
          <a href="#selfies" className="btn">Selfies</a>
          <a href="#special" className="btn">Special Experiences</a>
          <a href="#panels" className="btn">Panels</a>
        </div>
      </div>

      <div className="section container">
        <Section id="autographs" image="/retailers/mc-autograph.png" title="Autographs">
          <Tip label="Where to buy">Autograph tickets are available at the guest's table in the autograph area all weekend. Stop by to ask about availability and pricing, and to get yours signed.</Tip>
          <Tip label="Buy early for popular guests">If a star is offering advance autograph sales, grab yours early so you don't have to worry about selling out.</Tip>
          <Tip label="Bring cash">Many autographs are handled as cash transactions at the table. Pick some up before you arrive — and remember there are ATMs on-site if you need them.</Tip>
          <Tip label="Bring something to sign">Bring a poster, photo, or collectible — or pick up something to sign from the guest or a vendor on the floor.</Tip>
        </Section>

        <Section id="photo-ops" image="/retailers/mc-photo.png" title="Photo Ops">
          <Tip label="How it works">Our photo op team gets you in and out fast — they'll scan your ticket, line you up, and capture your moment with your favorite guest. Have your pose ready!</Tip>
          <Tip label="Bring your crew">Depending on the guest, a single photo op ticket can include a few friends in the shot. Check the details for each guest when you book.</Tip>
          <Tip label="Timing">Photo ops run on a schedule tied to each guest's appearance. Watch the schedule and arrive a few minutes early for your slot.</Tip>
          <Tip label="Prints & digitals">You'll receive your photo after the session; additional prints or digital copies are usually available to purchase.</Tip>
        </Section>

        <Section id="selfies" image="/retailers/mc-selfie.png" title="Selfies">
          <Tip label="Check availability">Some guests offer selfies right at their table in the autograph area, usually for a fee. Not every guest offers them, so ask at the table.</Tip>
          <Tip label="Want a guaranteed shot?">For the most polished photo with professional lighting, book a photo op (where available) instead of a table selfie.</Tip>
        </Section>

        <Section id="special" image="/retailers/mc-special.png" title="Special Experiences">
          <Tip label="What they are">Special Experiences are ticketed events that get you closer to the stars — from intimate Q&As to themed sessions and more. Browse our <Link to="/special-experiences">Special Experiences</Link> page for what's on offer.</Tip>
          <Tip label="Packages">Some experiences bundle extras like a photo op or autograph. There's something for every kind of fan, whether you want simple or all-out.</Tip>
        </Section>

        <Section id="panels" image="/retailers/mc-panels.png" title="Panels">
          <Tip label="Get the inside scoop">Panels are a great way to hear directly from guests, hosted by our moderators. Some panels take audience questions — a chance to ask your fave directly.</Tip>
          <Tip label="Mic etiquette">When the mic opens, hop in line and keep it to one question so everyone gets a turn. Be kind and have fun.</Tip>
        </Section>
      </div>

      <div className="section container">
        <h2 className="glow">FAQ</h2>
        <div style={{ maxWidth: 880 }}>
          {FAQS.map((f) => <Faq key={f.q} {...f} />)}
        </div>
      </div>
    </div>
  );
}
