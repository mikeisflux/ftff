import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider.jsx';

// Full-featured hero carousel (§7.1.1): autoplay with pause-on-hover, swipe on
// touch, prev/next arrows, dots, lazy images. Respects prefers-reduced-motion
// (no autoplay). Renders a static fallback when there is a single slide and a
// branded fallback (the logo) when there are none.
export default function HeroCarousel({ slides = [], fallbackTitle, fallbackSubtitle }) {
  const { theme, mode } = useTheme();
  const logo = (mode === 'light' ? theme?.logo_light_url : theme?.logo_dark_url) || theme?.logo_url;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);
  const count = slides.length;

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (count <= 1 || paused || reduceMotion) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % count), 6000);
    return () => clearInterval(t);
  }, [count, paused, reduceMotion]);

  const go = (n) => setI(((n % count) + count) % count);

  // No slides yet — branded fallback (honest empty state, not placeholder text).
  if (count === 0) {
    return (
      <section className="hero section">
        <div className="container">
          {logo
            ? <img src={logo} alt={fallbackTitle} className="hero-logo" />
            : <h1 className="glow">{fallbackTitle}</h1>}
          {fallbackSubtitle && <p className="muted" style={{ fontSize: '1.2rem' }}>{fallbackSubtitle}</p>}
          <Link to="/buy-tickets" className="btn">Buy Tickets</Link>
        </div>
      </section>
    );
  }

  const slide = slides[i];

  return (
    <section
      className="hero section"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
        touchX.current = null;
      }}
      style={{
        background: slide.image_url
          ? `linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.6)), url(${slide.image_url}) center/cover`
          : undefined,
      }}
      aria-roledescription="carousel"
    >
      <div className="container">
        <h1 className="glow">{slide.title || fallbackTitle}</h1>
        {slide.subtitle && <p className="muted" style={{ fontSize: '1.2rem' }}>{slide.subtitle}</p>}
        {slide.cta_url ? (
          <Link to={slide.cta_url} className="btn">{slide.cta_label || 'Learn More'}</Link>
        ) : (
          <Link to="/buy-tickets" className="btn">Buy Tickets</Link>
        )}
      </div>

      {count > 1 && (
        <>
          <button className="hero-arrow left" aria-label="Previous slide" onClick={() => go(i - 1)}>‹</button>
          <button className="hero-arrow right" aria-label="Next slide" onClick={() => go(i + 1)}>›</button>
          <div className="hero-dots">
            {slides.map((s, n) => (
              <button
                key={s.id}
                className={n === i ? 'dot active' : 'dot'}
                aria-label={`Go to slide ${n + 1}`}
                aria-current={n === i}
                onClick={() => go(n)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
