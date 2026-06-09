import HeroCarousel from '../components/HeroCarousel.jsx';
import { Link } from 'react-router-dom';

function Section({ id, image, alt, flip, title, children }) {
  const img = <img src={image} alt={alt} style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block' }} />;
  return (
    <div id={id} className="info-row" style={{ alignItems: 'start', scrollMarginTop: 90 }}>
      {flip ? <div>{img}</div> : <div>{img}</div>}
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

// First Time Guide — original copy adapted to For The Fans Fest. No video guide.
export default function FirstTimeGuide() {
  const slides = [{
    id: 0,
    image_url: '/retailers/hero-1.png',
    title: 'Your First Fest Starts Here',
    subtitle: "New to the con scene? Here's everything you need to make the most of your weekend at For The Fans Fest.",
    cta_url: '/buy-tickets',
    cta_label: 'Buy Tickets',
  }];

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle="First Time Guide" />

      <div className="section container" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#planning" className="btn">Planning Ahead</a>
          <a href="#wear" className="btn">What to Wear &amp; Bring</a>
          <a href="#tips" className="btn">Top Tips for the Show</a>
        </div>
      </div>

      <div className="section container">
        <Section id="planning" image="/retailers/ftg-plan.png" alt="Planning ahead" title="Planning Ahead">
          <Tip label="Stay in the loop">Follow For The Fans Fest on social and sign up for our newsletter for guest reveals, schedule drops, and weekend updates — think of it as your live feed to the show.</Tip>
          <Tip label="Pack the essentials">Bring your ticket or confirmation, a refillable water bottle, a portable charger, and any items you'd like signed (or grab something on the floor).</Tip>
          <Tip label="Map your day">Once the schedule is live, mark the panels, photo ops, and guests you can't miss, then build in time to wander the floor and find hidden gems.</Tip>
          <Tip label="Lock in experiences early">Photo ops and autographs with popular guests sell out. Pre-purchase what you can to guarantee your spot, and arrive early for the rest.</Tip>
          <Tip label="Know your ticket">Keep your confirmation handy for entry. Digital ticket holders get a confirmation number to sign in to the LIVE virtual stream — no QR needed.</Tip>
        </Section>

        <Section id="wear" image="/retailers/ftg-wear.png" alt="What to wear and bring" flip title="What to Wear & Bring">
          <Tip label="Cosplay is optional">Wear what makes you happy — a full build, something cosplay-inspired, or just comfy clothes. First-timers: a small themed accessory is a fun, low-pressure way to join in.</Tip>
          <Tip label="Comfort first">It's a marathon, not a sprint. Comfortable shoes and an outfit you can move in will save your weekend.</Tip>
          <Tip label="Cash & card">Most vendors take cards, but some autographs and small sellers are cash-friendly — bring a little of both. ATMs are available on-site.</Tip>
          <Tip label="Travel smart">Check our <Link to="/getting-here">Getting Here</Link> page for the best ways to reach Harrah's Resort Atlantic City — parking, the AC Jitney, rail, and rideshare.</Tip>
        </Section>

        <Section id="tips" image="/retailers/ftg-tips.png" alt="Top tips for the show" title="Top Tips for the Show">
          <Tip label="Smooth entry">Arrive a little early to breeze through the doors. We'll share arrival, bag, and entry details closer to the show.</Tip>
          <Tip label="Be kind on the floor">Cosplay is not consent. Always ask before photographing or posing with a cosplayer.</Tip>
          <Tip label="Have a celeb game plan">Pre-book photo ops when you can and line up early for autographs to get the best shot at meeting your favorites.</Tip>
          <Tip label="Pace yourself">Take breaks, hydrate, and step outside for air. A rested fan is a happy fan.</Tip>
          <Tip label="Don't miss the LIVE experience">Can't catch everything in person? Digital ticket holders can stream featured programming on our <Link to="/virtual">LIVE</Link> page.</Tip>
        </Section>
      </div>
    </div>
  );
}
