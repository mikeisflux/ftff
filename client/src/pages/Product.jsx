import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useCart } from '../store/CartContext.jsx';

const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format((cents || 0) / 100);

const variantLabel = (v) =>
  Object.keys(v.options || {}).length ? Object.values(v.options).join(' / ') : 'Standard';

export default function Product() {
  const { slug } = useParams();
  const nav = useNavigate();
  const cart = useCart();
  const { data, isLoading, error } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => api(`/products/${slug}`),
    retry: false,
  });
  const [variantId, setVariantId] = useState(null);
  const [added, setAdded] = useState(false);

  if (isLoading) return <div className="section container"><p className="muted">Loading…</p></div>;
  if (error) return <div className="section container"><h1>Product not found</h1><Link className="btn secondary" to="/shop">Back to shop</Link></div>;

  const p = data.product;
  const variants = p.variants || [];
  const selected = variants.find((v) => v.id === variantId) || variants[0];
  const price = selected?.price_cents ?? p.price_cents;
  const inStock = selected && selected.inventory > 0;

  function add() {
    if (!selected) return;
    cart.add({
      variantId: selected.id,
      title: `${p.title}${Object.keys(selected.options || {}).length ? ` (${variantLabel(selected)})` : ''}`,
      unitPriceCents: price,
      image: p.images?.[0] || null,
    });
    setAdded(true);
  }

  return (
    <div className="section container" style={{ maxWidth: 860 }}>
      <Link className="muted" to="/shop">← Shop</Link>
      <div className="grid" style={{ gridTemplateColumns: p.images?.[0] ? '1fr 1fr' : '1fr', marginTop: 12 }}>
        {p.images?.[0] && <img src={p.images[0]} alt={p.title} style={{ width: '100%', borderRadius: 'var(--radius)' }} />}
        <div>
          <h1 className="glow" style={{ marginTop: 0 }}>{p.title}</h1>
          <p style={{ fontSize: '1.4rem' }}>{money(price, p.currency)}</p>
          {p.description && <p className="muted">{p.description}</p>}

          {variants.length > 1 && (
            <>
              <label>Option</label>
              <select value={selected?.id} onChange={(e) => setVariantId(e.target.value)}>
                {variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.inventory <= 0}>
                    {variantLabel(v)}{v.inventory <= 0 ? ' — sold out' : ''}
                  </option>
                ))}
              </select>
            </>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn" onClick={add} disabled={!inStock}>
              {inStock ? 'Add to cart' : 'Sold out'}
            </button>
            {added && <button className="btn secondary" onClick={() => nav('/cart')}>Go to cart</button>}
          </div>
          {added && <p className="muted" style={{ marginTop: 8 }}>Added to your cart.</p>}
        </div>
      </div>
    </div>
  );
}
