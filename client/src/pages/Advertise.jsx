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

// Advertise With Us — mirrors the FAN EXPO advertise layout (Newsletter / Display
// Advertising / Digital OOH & Signage), branded to our colors and reworded for
// For The Fans Fest. CTAs point to Contact Us.
export default function Advertise() {
  const slides = [{
    id: 0,
    image_url: '/retailers/hero-advertise.png',
    title: 'Advertise With Us',
    subtitle: 'Reach thousands of passionate pop-culture fans before, during, and after For The Fans Fest.',
    cta_url: '/contact-us',
    cta_label: 'Contact Us',
  }];

  return (
    <div>
      <HeroCarousel slides={slides} fallbackTitle="Advertise With Us" />

      <div className="section container">
        <Row image="/retailers/newsletter.png" alt="The For The Fans Fest newsletter" flip>
          <h2 className="glow" style={{ marginTop: 0 }}>The For The Fans Fest Newsletter</h2>
          <p>Your monthly fan-stop for everything in pop culture — TV, film, anime, horror, comics, and more.</p>
          <p>Reach our subscribers with advertorials, content marketing, and display advertising opportunities.</p>
          <Link to="/contact-us" className="btn">Contact Us</Link>
        </Row>

        <Row image="/retailers/display.png" alt="Display advertising">
          <h2 className="glow" style={{ marginTop: 0 }}>Display Advertising</h2>
          <p>Turnkey, CPM-based digital advertising opportunities.</p>
          <p>Want to dream big? Show takeovers and full-event campaigns are our specialty.</p>
          <Link to="/contact-us" className="btn">Contact Us</Link>
        </Row>

        <Row image="/retailers/signage.png" alt="Digital out-of-home and signage" flip>
          <h2 className="glow" style={{ marginTop: 0 }}>Digital OOH &amp; Signage</h2>
          <p>Share your sizzle reels, trailers, clips, and 60-second spots with our attendees on our largest stages and in the walkways throughout the venue.</p>
          <Link to="/contact-us" className="btn">Contact Us</Link>
        </Row>
      </div>
    </div>
  );
}
