import { Link } from 'react-router-dom';
import HeroCarousel from '../components/HeroCarousel.jsx';

// Alternating image/text row.
function Row({ image, alt, flip, children }) {
  const img = <img src={image} alt={alt} style={{ width: '100%', borderRadius: 'var(--radius)', display: 'block' }} />;
  return (
    <div className="info-row">
      {flip ? <div>{children}</div> : img}
      {flip ? img : <div>{children}</div>}
    </div>
  );
}

// Corporate Partnerships, Exhibiting & Sponsorship page. Mirrors the FAN EXPO
// corporate layout (Engage / Connect / Corporate Partners), branded to our
// colors, with the CTA pointing at Contact Us.
export default function Corporate() {
  const slides = [{
    id: 0,
    image_url: '/retailers/hero-corporate.png',
    title: 'Corporate Partnerships, Exhibiting & Sponsorship',
    subtitle: 'Put your brand in front of thousands of passionate fans at For The Fans Fest.',
    cta_url: '/contact-us',
    cta_label: 'Contact Us',
  }];

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle="Corporate Partnerships" />

      <div className="section container">
        <Row image="/retailers/engage.png" alt="Engage">
          <h2 className="glow" style={{ marginTop: 0 }}>Engage</h2>
          <p>Over a fan-filled weekend, connect with thousands of attendees at your booth.</p>
          <Link to="/contact-us" className="btn">Contact Us</Link>
        </Row>

        <Row image="/retailers/connect.png" alt="Connect" flip>
          <h2 className="glow" style={{ marginTop: 0 }}>Connect</h2>
          <p>Join our partners who tap into digital and social marketing channels leading up to, during, and even after the event to drive sales.</p>
          <p>Reach our fans through display, email, and social campaigns.</p>
          <Link to="/contact-us" className="btn">Contact Us</Link>
        </Row>

        <Row image="/retailers/partners.png" alt="Corporate Partners">
          <h2 className="glow" style={{ marginTop: 0 }}>Corporate Partners</h2>
          <p>Our partners love our fans… and our fans love our partners!</p>
          <p>For The Fans Fest is proud to connect the world’s leading brands and the new up-and-comers to our passionate audience.</p>
          <Link to="/contact-us" className="btn">Contact Us</Link>
        </Row>
      </div>
    </div>
  );
}
