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
export const STYLES = ['Red', 'WhiteWine', 'Rose', 'Orange', 'Sparkling', 'Sweet', 'Fortified',
  'Vintage', 'Tawny', 'White', 'Rivesaltes', 'Aguardente'] as const;
export const styleName = (key: string) =>
  (STYLES as readonly string[]).includes(key) ? t(`style.${key}` as Key) : key;

// Style badge colour
export const STYLE_TONES: Record<string, string> = {
  Vintage: '#a3213a',
  Tawny: '#b8742e',
  Rivesaltes: '#9c4a2c',
  White: '#e0c27a',
  Aguardente: '#dba65a',
  Red: '#861530',
  WhiteWine: '#e0c27a',
  Rose: '#d98a8a',
  Orange: '#d08a3a',
  Sparkling: '#e8d9a0',
  Sweet: '#c9a66b',
  Fortified: '#9c4a2c',
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
