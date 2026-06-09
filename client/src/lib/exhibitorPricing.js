// Client mirror of the server's exhibitor pricing (server/src/lib/exhibitorPricing.js).
// Used only for the live in-form preview — the server recomputes and is the
// source of truth for what's actually charged.

export const PRICES = {
  hotel: { night1: 10899, night2: 16699, night3: 7699 },
  boothBase: 25000,
  extraTable: 10000,
  banquetPerPerson: 20000,
};

const DEPOSIT_RATE = { booth: 0.5, addons: 0.6 };

export function computeExhibitorPricing(form) {
  const extraTables = Math.max(0, Math.trunc(Number(form.extra_tables) || 0));
  const banquetCount = form.banquet
    ? Math.max(0, Math.trunc(Number(form.banquet_chicken) || 0))
      + Math.max(0, Math.trunc(Number(form.banquet_beef) || 0))
      + Math.max(0, Math.trunc(Number(form.banquet_vegan) || 0))
    : 0;

  const lineItems = [];
  lineItems.push({ key: 'booth', label: 'Booth (table + 2 chairs)', qty: 1, amountCents: PRICES.boothBase, bucket: 'booth' });
  if (extraTables > 0) lineItems.push({ key: 'extra_tables', label: 'Additional tables', qty: extraTables, amountCents: extraTables * PRICES.extraTable, bucket: 'booth' });
  if (form.hotel_night1) lineItems.push({ key: 'hotel_night1', label: 'Hotel — Night 1', qty: 1, amountCents: PRICES.hotel.night1, bucket: 'addons' });
  if (form.hotel_night2) lineItems.push({ key: 'hotel_night2', label: 'Hotel — Night 2', qty: 1, amountCents: PRICES.hotel.night2, bucket: 'addons' });
  if (form.hotel_night3) lineItems.push({ key: 'hotel_night3', label: 'Hotel — Night 3', qty: 1, amountCents: PRICES.hotel.night3, bucket: 'addons' });
  if (banquetCount > 0) lineItems.push({ key: 'banquet', label: 'Banquet attendance', qty: banquetCount, amountCents: banquetCount * PRICES.banquetPerPerson, bucket: 'addons' });

  const boothBucketCents = lineItems.filter((l) => l.bucket === 'booth').reduce((s, l) => s + l.amountCents, 0);
  const addonsBucketCents = lineItems.filter((l) => l.bucket === 'addons').reduce((s, l) => s + l.amountCents, 0);
  const totalCents = boothBucketCents + addonsBucketCents;
  const depositCents = Math.round(boothBucketCents * DEPOSIT_RATE.booth) + Math.round(addonsBucketCents * DEPOSIT_RATE.addons);

  return { lineItems, totalCents, depositCents, balanceCents: totalCents - depositCents, extraTables, banquetCount };
}

export const money = (cents, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format((cents || 0) / 100);
