// Date-only formatting that ignores timezone (the API sends date columns as
// midnight-UTC ISO strings; using the Date object would shift them a day in the
// US). We parse the YYYY-MM-DD parts directly.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function parts(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** "October 16, 2026" */
export function formatDate(s) {
  const p = parts(s);
  return p ? `${MONTHS[p.m - 1]} ${p.d}, ${p.y}` : '';
}

/** "October 16–18, 2026" (collapses shared month/year). */
export function formatDateRange(start, end) {
  const a = parts(start);
  if (!a) return '';
  const b = parts(end);
  if (!b) return formatDate(start);
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}, ${a.y}`;
  return `${formatDate(start)} – ${formatDate(end)}`;
}
