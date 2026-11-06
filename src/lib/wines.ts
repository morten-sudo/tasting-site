// Shared by the wine pages: data type, style names and style colours.

export type Wine = {
  id: number; sort_order: number; name: string; producer: string | null;
  style: string | null; vintage: string | null; abv: number | null;
  price_dkk: number | null; description: string | null; orderable: boolean;
  image_url: string | null; details: string | null; retail_price_dkk: number | null;
  price_tiers?: PriceTier[] | null;
  country?: string | null; region?: string | null; appellation?: string | null; appellation_id?: string | null;
  producer_website?: string | null; producer_address?: string | null; producer_lat?: number | null; producer_lon?: number | null;
  grapes?: string | null; food_pairing?: string | null; serving?: string | null;
  /** Blind: the guests see only its number and style until the host reveals it */
  blind?: boolean;
  /** Bottle size in cl (get_wines' last column; null for a blind wine, missing from an older database) */
  bottle_cl?: number | null;
};

import { formatKr } from './ui/kr';
import { t, type Key } from '../i18n';
import { facts } from './ui/facts';

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


/** "2024" → "Årgang 2024", "10 år" → "10 år", empty → null */
export function vintageLabel(w: Wine): string | null {
  if (!w.vintage) return null;
  if (/^n\.?\s?v\.?$/i.test(w.vintage.trim())) return t('wine.nv');
  return /^\d{4}$/.test(w.vintage) ? t('wine.vintage', { year: w.vintage }) : w.vintage;
}


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
  return tiersOf(w).map((x) => t('price.bulk', { n: x.qty, price: formatKr(Number(x.price)) }));
}

/** The next quantity price the guest can reach from n bottles, as a label, or null. */
export function nextTierLabel(w: Pick<Wine, 'price_tiers'>, n: number) {
  const next = tiersOf(w).find((x) => x.qty > n);
  return next ? t('price.bulk', { n: next.qty, price: formatKr(Number(next.price)) }) : null;
}

/** A wine's name as an address part: "Rivesaltes Ambré 1966" → "rivesaltes-ambre-1966" */
export function wineSlug(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'wine';
}

/** The address part of each wine in a tasting: its name and, when it has one, its year ("kopke-vintage-2024"), so two
 *  vintages of a wine never share an address; anything still the same gets -2, -3 … */
export function wineSlugs(wines: (Pick<Wine, 'id' | 'name'> & { vintage?: string | null; blind?: boolean })[]): Map<number, string> {
  const used = new Map<string, number>();
  const out = new Map<number, string>();
  for (const w of wines) {
    // A blind wine is addressed by its number in the database, so the address still works once it is revealed
    if (w.blind) { out.set(w.id, String(w.id)); continue; }
    // The year is part of the address (not ages like "10 år", which are in the name); not twice if the name has it
    const year = w.vintage && /^\d{4}$/.test(w.vintage.trim()) ? w.vintage.trim() : null;
    let base = wineSlug(w.name);
    if (year && !base.endsWith(`-${year}`)) base = `${base}-${year}`;
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

/** Grapes, what the wine goes with and how to serve it: the facts list (22) with an icon each, or null when none is known. */
export function wineFacts(w: { grapes?: string | null; food_pairing?: string | null; serving?: string | null }): HTMLDListElement | null {
  return facts([
    { icon: 'grapes', label: t('label.grapes'), value: w.grapes },
    { icon: 'food', label: t('wineFields.food'), value: w.food_pairing },
    { icon: 'serving', label: t('wineFields.serving'), value: w.serving },
  ]);
}

/** The wine's type as the small line above its name, in the style's colour ("— TAWNY") */
export function styleTag(w: Pick<Wine, 'style'>, large = false): HTMLElement {
  const p = document.createElement('p');
  p.className = 'style-tag' + (large ? ' lg' : '');
  p.textContent = w.style ? styleName(w.style) : '';
  p.style.setProperty('--tone', STYLE_TONES[w.style ?? ''] ?? 'var(--amber)');
  return p;
}

/** Blind wines get "Wine 3" (their place in the evening) as name; the rest is not sent by the database. */
export function nameBlind<T extends Pick<Wine, 'name' | 'blind'>>(wines: T[]): T[] {
  wines.forEach((w, i) => { if (w.blind) w.name = t('blind.name', { n: i + 1 }); });
  return wines;
}

/** Calls back when the host reveals, blinds, shows or hides a wine (the list of ids or a blind flag changes): checks every
 *  15 seconds while the page is open. */
export function watchBlind(load: () => Promise<{ id: number; blind?: boolean }[]>, current: { id: number; blind?: boolean }[], changed: () => void) {
  const sig = (list: { id: number; blind?: boolean }[]) => list.map((w) => `${w.id}${w.blind ? 'b' : ''}`).join(',');
  let last = sig(current);
  const timer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const now = sig(await load());
      if (now !== last) { last = now; clearInterval(timer); changed(); }
    } catch { /* offline for a moment: try again next time */ }
  }, 15000);
}
