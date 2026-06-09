// Exhibitor pricing (Become an Exhibitor flow). Prices are authoritative on the
// server — the browser computes the same numbers only for a live preview, but
// the totals charged are ALWAYS recomputed here from the submitted selections.
//
// Deposit policy (per spec): when paying a deposit rather than the full total,
// the vendor pays 50% of the booth (base booth fee + any extra tables) plus 60%
// of the add-ons (hotel nights + banquet). The balance is billed later.

export const PRICES = {
  hotel: { night1: 10899, night2: 16699, night3: 7699 }, // cents
  boothBase: 25000,        // $250 booth (includes 1 table + 2 chairs)
  extraTable: 10000,       // $100 each additional table
  banquetPerPerson: 20000, // $200 per banquet attendee
};

export const DEPOSIT_RATE = { booth: 0.5, addons: 0.6 };

const money = (c) => Math.round(c);

/**
 * Compute the authoritative pricing for an exhibitor application.
 * Returns { lineItems, boothBucketCents, addonsBucketCents, totalCents,
 *           depositCents, balanceCents, extraTables, banquetCount }.
 */
export function computeExhibitorPricing(input) {
  const extraTables = Math.max(0, Math.trunc(Number(input.extra_tables) || 0));
  const banquetCount = input.banquet
    ? Math.max(0, Math.trunc(Number(input.banquet_chicken) || 0))
      + Math.max(0, Math.trunc(Number(input.banquet_beef) || 0))
      + Math.max(0, Math.trunc(Number(input.banquet_vegan) || 0))
    : 0;

  const lineItems = [];

  // Booth bucket (50% deposit).
  lineItems.push({ key: 'booth', label: 'Booth (table + 2 chairs)', qty: 1, unitCents: PRICES.boothBase, amountCents: PRICES.boothBase, bucket: 'booth' });
  if (extraTables > 0) {
    lineItems.push({ key: 'extra_tables', label: 'Additional tables', qty: extraTables, unitCents: PRICES.extraTable, amountCents: extraTables * PRICES.extraTable, bucket: 'booth' });
  }

  // Add-on bucket (60% deposit): hotel nights + banquet.
  if (input.hotel_night1) lineItems.push({ key: 'hotel_night1', label: 'Hotel — Night 1', qty: 1, unitCents: PRICES.hotel.night1, amountCents: PRICES.hotel.night1, bucket: 'addons' });
  if (input.hotel_night2) lineItems.push({ key: 'hotel_night2', label: 'Hotel — Night 2', qty: 1, unitCents: PRICES.hotel.night2, amountCents: PRICES.hotel.night2, bucket: 'addons' });
  if (input.hotel_night3) lineItems.push({ key: 'hotel_night3', label: 'Hotel — Night 3', qty: 1, unitCents: PRICES.hotel.night3, amountCents: PRICES.hotel.night3, bucket: 'addons' });
  if (banquetCount > 0) lineItems.push({ key: 'banquet', label: 'Banquet attendance', qty: banquetCount, unitCents: PRICES.banquetPerPerson, amountCents: banquetCount * PRICES.banquetPerPerson, bucket: 'addons' });

  const boothBucketCents = lineItems.filter((l) => l.bucket === 'booth').reduce((s, l) => s + l.amountCents, 0);
  const addonsBucketCents = lineItems.filter((l) => l.bucket === 'addons').reduce((s, l) => s + l.amountCents, 0);
  const totalCents = boothBucketCents + addonsBucketCents;
  const depositCents = money(boothBucketCents * DEPOSIT_RATE.booth) + money(addonsBucketCents * DEPOSIT_RATE.addons);

  return {
    lineItems,
    boothBucketCents,
    addonsBucketCents,
    totalCents,
    depositCents,
    balanceCents: totalCents - depositCents,
    extraTables,
    banquetCount,
  };
}
