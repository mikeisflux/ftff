// Flat per-order shipping fee by destination region. Rates are admin-configured
// (Admin → Shipping) and delivered to the browser via public-config; the static
// metadata (labels, country codes, fallback defaults) lives here. The server is
// the source of truth for what's actually charged.
export const SHIPPING_REGION_META = [
  { key: 'domestic', label: 'United States', countries: ['US'], default: 1300 },
  { key: 'canada', label: 'Canada', countries: ['CA'], default: 2600 },
  { key: 'uk', label: 'United Kingdom', countries: ['GB'], default: 4000 },
  { key: 'world', label: 'Rest of world', countries: null, default: 5000 },
];

// Merge admin-configured rates (cents, keyed by region) over the defaults.
export function shippingRegions(rates = {}) {
  return SHIPPING_REGION_META.map((r) => {
    const n = Number(rates?.[r.key]);
    return { ...r, cents: Number.isFinite(n) && n >= 0 ? n : r.default };
  });
}

export const shippingCentsFor = (region, rates) =>
  shippingRegions(rates).find((r) => r.key === region)?.cents ?? 0;

export const countriesFor = (region) =>
  SHIPPING_REGION_META.find((r) => r.key === region)?.countries ?? null;
