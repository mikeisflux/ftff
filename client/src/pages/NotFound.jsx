import { Link } from 'react-router-dom';

// Catch-all for unknown public paths so nothing ever renders blank.
export default function NotFound() {
  return (
    <div className="section container">
      <h1 className="glow">Page not found</h1>
      <p className="muted">That page doesn’t exist. Try one of these:</p>
      <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <Link className="btn" to="/">Home</Link>
        <Link className="btn secondary" to="/buy-tickets">Tickets</Link>
        <Link className="btn secondary" to="/all-guests">Guests</Link>
        <Link className="btn secondary" to="/contact-us">Contact</Link>
      </p>
    </div>
  );
}
