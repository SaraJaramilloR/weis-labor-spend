// Display formatting. Null always renders as "n/a" so a missing ratio never looks like a real zero.
const NA = 'n/a';
const money0 = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
const money2 = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2});
const int = new Intl.NumberFormat('en-US', {maximumFractionDigits: 0});
const one = new Intl.NumberFormat('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const two = new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const upTo2 = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});

const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');

function compactNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${one.format(a / 1e9)}B`;
  if (a >= 1e7) return `${one.format(a / 1e6)}M`;
  if (a >= 1e6) return `${two.format(a / 1e6)}M`;
  if (a >= 1e4) return `${one.format(a / 1e3)}K`;
  return int.format(a);
}

export const fmt = {
  money: (v: number | null | undefined) => (ok(v) ? money0.format(v) : NA),
  money2: (v: number | null | undefined) => (ok(v) ? money2.format(v) : NA),
  compactMoney: (v: number | null | undefined) => (ok(v) ? `${v < 0 ? '−' : ''}$${compactNumber(v)}` : NA),
  signedCompactMoney: (v: number | null | undefined) => (ok(v) ? `${sign(v)}$${compactNumber(v)}` : NA),
  signedMoney: (v: number | null | undefined) => (ok(v) ? `${sign(v)}${money0.format(Math.abs(v))}` : NA),
  int: (v: number | null | undefined) => (ok(v) ? int.format(v) : NA),
  signedInt: (v: number | null | undefined) => (ok(v) ? `${sign(Math.round(v))}${int.format(Math.abs(v))}` : NA),
  hours: (v: number | null | undefined) => (ok(v) ? `${int.format(v)} hrs` : NA),
  compactHours: (v: number | null | undefined) => (ok(v) ? `${compactNumber(v)} hrs` : NA),
  signedHours: (v: number | null | undefined) => (ok(v) ? `${sign(Math.round(v))}${int.format(Math.abs(v))} hrs` : NA),
  compact: (v: number | null | undefined) => (ok(v) ? `${v < 0 ? '−' : ''}${compactNumber(v)}` : NA),
  pct: (v: number | null | undefined, digits = 1) => (ok(v) ? `${(v * 100).toFixed(digits)}%` : NA),
  signedPct: (v: number | null | undefined, digits = 1) => (ok(v) ? `${sign(Math.round(v * 10 ** (digits + 2)))}${Math.abs(v * 100).toFixed(digits)}%` : NA),
  /** Rate difference in percentage points; input is a fraction (0.004 → "+0.40 pp"). */
  /** Percentage points; the sign comes from the rounded value, so a rounded negative zero reads "0.0 pp". */
  pp: (v: number | null | undefined, digits = 2) => {
    if (!ok(v)) return NA;
    const r = Number((v * 100).toFixed(digits));
    return `${sign(r)}${Math.abs(r).toFixed(digits)} pp`;
  },
  /** Hours with up to two decimals (schedule hours are kept in quarter hours: 34,198.83, 302.25). */
  hours2: (v: number | null | undefined) => (ok(v) ? upTo2.format(v) : NA),
  /** Signed hours with up to two decimals; the sign comes from the rounded value, so −0.001 reads "0". */
  signedHours2: (v: number | null | undefined) => {
    if (!ok(v)) return NA;
    const r = Math.round(v * 100) / 100;
    return `${sign(r)}${upTo2.format(Math.abs(r))}`;
  },
  dec1: (v: number | null | undefined) => (ok(v) ? one.format(v) : NA),
  dec2: (v: number | null | undefined) => (ok(v) ? two.format(v) : NA),
  signedDec1: (v: number | null | undefined) => (ok(v) ? `${sign(Math.round(v * 10))}${one.format(Math.abs(v))}` : NA),
  signedDec2: (v: number | null | undefined) => (ok(v) ? `${sign(Math.round(v * 100))}${two.format(Math.abs(v))}` : NA),
};

/** ISO date → MM/DD/YYYY. The single display format for every client-facing date (labels, tooltips, exports). */
export function usDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}
/** ISO date → "Sun 10/18/2026". Weekday from the UTC date, so it never shifts with the browser time zone. */
export function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${usDate(iso)}`;
}
/** Typed MM/DD/YYYY (leading zeros optional) → ISO date, or null when it is not a real calendar date. */
export function parseUsDate(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === iso ? iso : null;
}
