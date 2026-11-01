// Shared by the wine pages: data type, style names and style colours.

export type Wine = {
  id: number; sort_order: number; name: string; producer: string | null;
  style: string | null; vintage: string | null; abv: number | null;
  price_dkk: number | null; description: string | null; orderable: boolean;
  image_url: string | null; details: string | null; retail_price_dkk: number | null;
  price_tiers?: PriceTier[] | null;
  country?: string | null; region?: string | null; appellation?: string | null; appellation_id?: string | null;
};

import { t, money, type Key } from '../i18n';

// Wine styles; the label comes from the dictionaries (style.<key>)
export const STYLES = ['Red', 'WhiteWine', 'Rose', 'Orange', 'Sparkling', 'Sweet', 'Fortified', 'Other'] as const;
export const styleName = (key: string) =>
  (STYLES as readonly string[]).includes(key) ? t(`style.${key}` as Key) : key;

// Style badge colour
export const STYLE_TONES: Record<string, string> = {
  Red: '#861530',
  WhiteWine: '#e0c27a',
  Rose: '#d98a8a',
  Orange: '#d08a3a',
  Sparkling: '#e8d9a0',
  Sweet: '#c9a66b',
  Fortified: '#7a1a2c',
  Other: '#9a8a7a',
};

export const styleLabel = (w: Wine) => (w.style ? styleName(w.style) : '');
export const styleTone = (w: Wine) => STYLE_TONES[w.style ?? ''] ?? 'var(--amber)';

/** "2024" → "Årgang 2024", "10 år" → "10 år", empty → null */
export function vintageLabel(w: Wine): string | null {
  if (!w.vintage) return null;
  if (/^n\.?\s?v\.?$/i.test(w.vintage.trim())) return t('wine.nv');
  return /^\d{4}$/.test(w.vintage) ? t('wine.vintage', { year: w.vintage }) : w.vintage;
}

export const kr = { format: (n: number) => money(n) };

export type PriceTier = { qty: number; price: number };

const tiersOf = (w: Pick<Wine, 'price_tiers'>) =>
  [...(w.price_tiers ?? [])].filter((x) => x && x.qty >= 2).sort((a, b) => a.qty - b.qty);

/** Price per bottle for n bottles: the highest quantity tier that n reaches, else the guest price. */
export function unitPrice(w: Pick<Wine, 'price_dkk' | 'price_tiers'>, n: number) {
  const tier = tiersOf(w).filter((x) => n >= x.qty).pop();
  return Number(tier ? tier.price : w.price_dkk ?? 0);
}

/** One label per quantity price: "From 6 bottles: 80 kr. each". */
export function tierLabels(w: Pick<Wine, 'price_tiers'>) {
  return tiersOf(w).map((x) => t('price.bulk', { n: x.qty, price: money(Number(x.price)) }));
}

/** The next quantity price the guest can reach from n bottles, as a label, or null. */
export function nextTierLabel(w: Pick<Wine, 'price_tiers'>, n: number) {
  const next = tiersOf(w).find((x) => x.qty > n);
  return next ? t('price.bulk', { n: next.qty, price: money(Number(next.price)) }) : null;
}

/** A wine's name as an address part: "Rivesaltes Ambré 1966" → "rivesaltes-ambre-1966" */
export function wineSlug(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'wine';
}

/** The address part of each wine in a tasting; two wines with the same name get -2, -3 … */
export function wineSlugs(wines: Pick<Wine, 'id' | 'name'>[]): Map<number, string> {
  const used = new Map<string, number>();
  const out = new Map<number, string>();
  for (const w of wines) {
    const base = wineSlug(w.name);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    out.set(w.id, n === 1 ? base : `${base}-${n}`);
  }
  return out;
}

/** "Château Fombrauge 2020" with vintage 2020 → "Château Fombrauge" (the year is shown from the vintage).
 *  The same as withoutYear in src/server/wine-ai.ts, which cleans names from the label and link readers. */
export function withoutYear(name: string | null, vintage: string | null): string | null {
  if (!name || !vintage || !/^\d{4}$/.test(vintage)) return name;
  const cleaned = name.replace(new RegExp(`(^|[\\s,–—-]+)${vintage}(?=$|[\\s,–—-])`, 'g'), ' ')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,–—-]+|[\s,–—-]+$/g, '').trim();
  return cleaned.length >= 2 ? cleaned : name;
}
