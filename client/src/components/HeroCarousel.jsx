import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const isVideo = (u) => /\.(mp4|webm|mov)(\?|$)/i.test(u || '');

// Full-featured hero carousel (§7.1.1): autoplay with pause-on-hover, swipe on
// touch, prev/next arrows, dots, lazy images. Respects prefers-reduced-motion
// (no autoplay). Renders a static fallback when there is a single slide and a
// branded fallback when there are none.
export default function HeroCarousel({ slides = [], fallbackTitle, fallbackSubtitle }) {
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
          <h1 className="glow">{fallbackTitle}</h1>
          {fallbackSubtitle && <p className="muted" style={{ fontSize: '1.2rem' }}>{fallbackSubtitle}</p>}
          <Link to="/buy-tickets" className="btn">Buy Tickets</Link>
        </div>
      </section>
    );
  }

  const slide = slides[i];
  const hasImage = !!slide.image_url;
  // An image slide shows the whole image scaled to the screen (responsive),
  // with any title/subtitle/CTA overlaid. Text-only slides use the centered box.
  const overlay = hasImage ? (slide.title || slide.subtitle || slide.cta_url) : true;

  return (
    <section
      className={`hero section${hasImage ? ' hero--image' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
        touchX.current = null;
      }}
      aria-roledescription="carousel"
    >
      {hasImage && (
        isVideo(slide.image_url) ? (
          <video
            className="hero-slide-img"
            src={slide.image_url}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={slide.title || fallbackTitle}
          />
        ) : (
          <img className="hero-slide-img" src={slide.image_url} alt={slide.title || fallbackTitle} />
        )
      )}

      {overlay && (
        <div className={hasImage ? 'hero-overlay' : 'container'}>
          {(slide.title || !hasImage) && <h1 className="glow">{slide.title || fallbackTitle}</h1>}
          {slide.subtitle && <p className="muted" style={{ fontSize: '1.2rem' }}>{slide.subtitle}</p>}
          {slide.cta_url ? (
            <Link to={slide.cta_url} className="btn">{slide.cta_label || 'Learn More'}</Link>
          ) : (!hasImage && (
            <Link to="/buy-tickets" className="btn">Buy Tickets</Link>
          ))}
        </div>
      )}

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
