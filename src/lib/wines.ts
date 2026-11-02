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

/** Grapes, what the wine goes with and how to serve it: a short list with an icon each, or null when none is known. */
export function wineFacts(w: { grapes?: string | null; food_pairing?: string | null; serving?: string | null }): HTMLElement | null {
  const ICONS: Record<string, string> = {
    grapes: '<circle cx="9" cy="10" r="2.6"/><circle cx="15" cy="10" r="2.6"/><circle cx="12" cy="14.5" r="2.6"/><circle cx="9" cy="19" r="2.6"/><circle cx="15" cy="19" r="2.6"/><path d="M12 7.5V3m0 1.5c1.5-1.8 3.5-2 5-1.5"/>',
    food: '<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 8V6.5M10.5 6.5h3"/><path d="M3 20h18"/>',
    serving: '<path d="M14 14.5V4a2 2 0 0 0-4 0v10.5a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  };
  const rows = ([['grapes', 'label.grapes', w.grapes], ['food', 'wineFields.food', w.food_pairing], ['serving', 'wineFields.serving', w.serving]] as const)
    .filter(([, , v]) => v && v.trim());
  if (!rows.length) return null;
  const ul = document.createElement('ul');
  ul.className = 'wine-facts';
  for (const [icon, key, value] of rows) {
    const li = document.createElement('li');
    li.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
    const text = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = t(key as Key);
    const span = document.createElement('span');
    span.textContent = value!.trim();
    text.append(b, span);
    li.append(text);
    ul.append(li);
  }
  return ul;
}

/** Blind wines get "Wine 3" (their place in the evening) as name; the rest is not sent by the database. */
export function nameBlind<T extends Pick<Wine, 'name' | 'blind'>>(wines: T[]): T[] {
  wines.forEach((w, i) => { if (w.blind) w.name = t('blind.name', { n: i + 1 }); });
  return wines;
}

/** A bottle silhouette in the colour of the wine's style, for a blind wine. Sparkling wine gets a foil top. */
export function blindBottle(style: string | null): string {
  const tone = STYLE_TONES[style ?? ''] ?? '#9a8a7a';
  const foil = style === 'Sparkling' ? '<path d="M26 4h12v22H26z" fill="#c9b27a"/>' : '';
  return `<svg class="blind-bottle" viewBox="0 0 64 200" aria-hidden="true">`
    + `<path d="M27 4h10v38c0 9 15 16 15 34v114c0 4-3 6-6 6H18c-3 0-6-2-6-6V76c0-18 15-25 15-34z" fill="${tone}"/>`
    + `${foil}<path d="M18 108h28v44H18z" fill="#fff" opacity=".22"/>`
    + `<text x="32" y="138" text-anchor="middle" font-size="22" fill="#fff" opacity=".9" font-family="Georgia, serif">?</text></svg>`;
}

/** Calls back when the host reveals (or blinds) a wine: checks every 15 seconds while the page is open. */
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
