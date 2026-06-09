import { Link } from 'react-router-dom';
import HeroCarousel from '../components/HeroCarousel.jsx';

function Row({ image, alt, flip, children }) {
  const img = <img src={image} alt={alt} style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block' }} />;
  return (
    <div className="info-row">
      {flip ? <div>{children}</div> : img}
      {flip ? img : <div>{children}</div>}
    </div>
  );
}

// Show Guides hub — links to the First Time Guide and Meeting Celebs Guide.
export default function ShowGuides() {
  const slides = [{
    id: 0,
    image_url: '/retailers/hero-2.png',
    title: 'Your Guides for an Epic Weekend',
    subtitle: "First-timer tips, celebrity meet-and-greet know-how, and everything in between — we've got you covered.",
    cta_url: '/first-time-guide',
    cta_label: 'First Time Guide',
  }];

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle="Show Guides" />

      <div className="section container" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/first-time-guide" className="btn">First Time Guide</Link>
          <Link to="/meeting-celebs-guide" className="btn">Meeting Celebs Guide</Link>
        </div>
      </div>

      <div className="section container">
        <Row image="/retailers/guide-firsttime.png" alt="First Time Guide">
          <h2 className="glow" style={{ marginTop: 0 }}>First Time Guide</h2>
          <p>Never been to a con? Start here. What to wear, what to bring, how to get in, and how to plan your day from open to close.</p>
          <Link to="/first-time-guide" className="btn secondary">Learn More</Link>
        </Row>

        <Row image="/retailers/guide-celebs.png" alt="Meeting Celebs Guide" flip>
          <h2 className="glow" style={{ marginTop: 0 }}>Meeting Celebs Guide</h2>
          <p>About to meet your favorite stars? Don't panic. Get the lowdown on autographs, photo ops, panels, and con etiquette.</p>
          <Link to="/meeting-celebs-guide" className="btn secondary">Learn More</Link>
        </Row>
      </div>
    </div>
  );
}
