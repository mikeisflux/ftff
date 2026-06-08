import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100);

export default function Shop() {
  const { data, isLoading } = useQuery({ queryKey: ['products'], queryFn: () => api('/products') });
  const products = data?.products ?? [];

  return (
    <div className="section container">
      <h1 className="glow">Shop</h1>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : products.length === 0 ? (
        <p className="muted">Merch drops soon — check back shortly.</p>
      ) : (
        <div className="grid cols-3">
          {products.map((p) => (
            <Link to={`/shop/${p.slug}`} className="card" key={p.id}>
              {p.images?.[0] && <img src={p.images[0]} alt={p.title} style={{ width: '100%', borderRadius: 8 }} />}
              <h3>{p.title}</h3>
              <p style={{ fontSize: '1.2rem' }}>{money(p.price_cents, p.currency)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
