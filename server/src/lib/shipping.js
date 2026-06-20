import { getSettingValue } from './settings.js';

// Flat per-order shipping fee by destination region. Rates are admin-configured
// (stored as settings keys) with sane defaults so checkout works before anyone
// visits Admin → Shipping.
export const SHIPPING_DEFAULT_CENTS = { domestic: 1300, canada: 2600, uk: 4000, world: 5000 };

export const SHIPPING_KEYS = {
  domestic: 'shipping.domestic_cents',
  canada: 'shipping.canada_cents',
  uk: 'shipping.uk_cents',
  world: 'shipping.world_cents',
};

export const SHIPPING_REGIONS = Object.keys(SHIPPING_DEFAULT_CENTS);

/** Resolve all four flat rates (cents), falling back to defaults. */
export async function getShippingRates() {
  const out = {};
  for (const region of SHIPPING_REGIONS) {
    const n = parseInt(await getSettingValue(SHIPPING_KEYS[region]), 10);
    out[region] = Number.isInteger(n) && n >= 0 ? n : SHIPPING_DEFAULT_CENTS[region];
  }
  return out;
}

/** Flat fee (cents) for one region, defaulting to domestic for unknown input. */
export async function shippingCentsFor(region) {
  const rates = await getShippingRates();
  return rates[region] ?? rates.domestic;
}
