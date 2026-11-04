// Bottle size (roadmap 4): every wine has a size in centilitres, 75 cl unless something else is set (wines.bottle_cl,
// 5–3000). Shared by the site and the Pages Functions (no browser code here): reading a size out of a name, a shop's
// title or a label ("MAGNUM", "1,5 l", "375 ml", "Jeroboam", "halv flaske"), taking it out of the name, and writing it
// as "150 cl" / "37,5 cl" in the reader's language. The iOS app shows the size the same way (bottleText()).

export const STANDARD_CL = 75;
export const MIN_CL = 5;
export const MAX_CL = 3000;
/** The sizes offered as choice cards in the wine's panel; anything else is typed as "Another size". */
export const COMMON_CL = [37.5, 75, 150, 300] as const;

export const validCl = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= MIN_CL && n <= MAX_CL;

/** Rounded to one decimal, the way the database keeps it (numeric(6,1)). */
const tidy = (n: number) => Math.round(n * 10) / 10;

/** "150 cl", "37,5 cl" (Danish) or "37.5 cl" (English) – null for an ordinary 75 cl bottle or no size. */
export function bottleText(cl: number | string | null | undefined, locale = 'da-DK'): string | null {
  const n = cl == null || cl === '' ? NaN : Number(cl);
  if (!Number.isFinite(n) || n === STANDARD_CL) return null;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format(n)} cl`;
}

// Named sizes, longest names first so "double magnum" wins over "magnum". Jeroboam is taken as 300 cl (the
// Champagne and Burgundy size, also the one most shops mean); Bordeaux's 500 cl jeroboam is rare in shops.
const NAMED: [RegExp, number][] = [
  [/\b(?:double|dobbelt|doppel|doppia|doble|dubbele|podw[óo]jn[ay])[\s-]*magnum\b/i, 300],
  [/\bnebuchadnezzar\b|\bnabuchodonosor\b/i, 1500],
  [/\bbalthazar\b/i, 1200],
  [/\bsalmanazar\b/i, 900],
  [/\bmethusalem\b|\bmethuselah\b|\bmathusalem\b/i, 600],
  [/\brehoboam\b|\br[ée]hoboam\b/i, 450],
  [/\bj[ée]roboam\b/i, 300],
  [/\bmagnum\b/i, 150],
  // Half bottles in the languages the shops write in
  [/\b(?:halv(?:e)?|half|halbe|demi|mezza|media|halve|p[óo][łl])[\s-]*(?:flaske|flasker|bottle|flasche|bouteille|bottiglia|botella|fles|butelk[ai])\b|(?<!\w)(?:½|1\/2)[\s-]*(?:flaske|bottle|fl\.?)(?!\w)/i, 37.5],
];

// A number with a unit: "150 cl", "1,5 l", "1.5L", "375 ml", "0,75 ltr", "37,5cl", "3 liter"
const AMOUNT = /(?:^|[^\d.,])(\d{1,4}(?:[.,]\d{1,3})?)\s?(cl|ml|l|ltr|liter|litre|litro|litri|litros)\b(?!['’])\.?/gi;

/** The size a text states, in centilitres, or null. A number with a unit wins over a name ("Magnum 1,5 l"). */
export function bottleIn(text: string | null | undefined): number | null {
  if (!text) return null;
  for (const m of text.matchAll(AMOUNT)) {
    const n = Number(m[1].replace(',', '.'));
    const unit = m[2].toLowerCase();
    const cl = unit === 'cl' ? n : unit === 'ml' ? n / 10 : n * 100;
    if (validCl(cl)) return tidy(cl);
  }
  for (const [re, cl] of NAMED) if (re.test(text)) return cl;
  return null;
}

/** The name without its size words: "Quinta do Noval LBV Magnum (150 cl)" → "Quinta do Noval LBV". */
export function withoutBottle(name: string | null | undefined): string | null {
  if (name == null) return null;
  let s = name;
  for (const [re] of NAMED) s = s.replace(new RegExp(re.source, 'gi'), ' ');
  s = s.replace(new RegExp(AMOUNT.source, 'gi'), (m) => (/^[^\d]/.test(m) ? m[0] : ''));
  const cleaned = s
    .replace(/\(\s*[,/–—-]?\s*\)|\[\s*\]/g, ' ')          // brackets left empty
    .replace(/\s*[,/·|–—-]\s*(?=[,/·|–—-]|$)/g, '')       // separators left at the end or doubled
    .replace(/^\s*[,/·|–—-]\s*/, '')
    .replace(/\s{2,}/g, ' ').trim();
  return cleaned.length >= 2 ? cleaned : name.trim();
}

/** A size typed by a host ("150", "37,5", "1,5 l", "375 ml") in centilitres; NaN when it is not a size, null when empty. */
export function parseCl(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const withUnit = bottleIn(s);
  if (withUnit != null && /[a-z]/i.test(s)) return withUnit;
  const n = Number(s.replace(/\s|cl\.?$/gi, '').replace(',', '.'));
  return Number.isFinite(n) ? tidy(n) : NaN;
}

/** "Quinta do Noval LBV · 150 cl" where only the wine's name is shown (order lines, totals); the name alone at 75 cl. */
export function nameWithSize(name: string, cl: number | string | null | undefined, locale = 'da-DK'): string {
  const size = bottleText(cl, locale);
  return size ? `${name} · ${size}` : name;
}

/** What a wine line needs: the type (already in words), vintage, size and producer. */
export type MetaWine = { style?: string | null; vintage?: string | null; producer?: string | null; bottle_cl?: number | string | null };

/** The one meta line wherever a wine is listed (WIN-170): "Rød · 2019 · 150 cl · producer" – the size after the vintage,
 *  no size at 75 cl. The parts, without empties and repeats; a list row joins them with " · ". `styleLabel` turns the
 *  stored type into words (styleName in the browser). Every list builds its line with this, so a new place gets the
 *  size too – scripts/check-ui.mjs fails a file that shows a wine without importing from here. */
export function wineMeta(w: MetaWine, locale = 'da-DK', styleLabel: (s: string) => string = (s) => s): string[] {
  const parts = [w.style ? styleLabel(w.style) : null, w.vintage ?? null, bottleText(w.bottle_cl, locale), w.producer ?? null];
  return parts.filter((x, i, arr): x is string => !!x && arr.indexOf(x) === i);
}
