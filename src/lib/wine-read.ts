// Reading a wine from a photo of its label or a shop link (Cloudflare Workers AI via /api/read-label and
// /api/read-link), shared by the wine form and the quick "New wine" line above the lists.
import { supabase } from './supabase';
import { forgetGuesses } from './overview-map';
import { loadAppellations, matchAppellation, normOrigin } from './origin';
import { formatCurrency } from './ui/kr';
import { t } from '../i18n';

const MAX_IMAGE_SIDE = 1400;

/** Shrinks a photo to at most MAX_IMAGE_SIDE px and re-encodes it as JPEG. */
export async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
}

/** A smaller JPEG data URI for reading the label (keeps the request light). */
export async function labelDataUrl(blob: Blob, maxSide = 1024): Promise<string | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return null;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

export type LabelResult = {
  name: string | null; producer: string | null; vintage: string | null; style: string | null;
  abv: number | null; appellation: string | null; region: string | null; country: string | null; grapes: string | null;
  /** The bottle size in cl when the label or page states it (src/lib/bottle.ts) */
  bottle_cl?: number | null;
};
export type LinkResult = LabelResult & {
  description: string | null; image: string | null; images?: string[]; price: number | null; source_url: string;
  food?: string | null; serving?: string | null;
  offer: { price: number; quantity: number } | null; foreign_currency?: string | null;
  /** The shop's own price and currency, as the page shows it */
  shop_price?: { amount: number; currency: string } | null;
  /** A euro price converted to kroner (price and offer are then in kroner) */
  converted?: { amount: number; currency: string; rate: number } | null;
};

/** The shop's price in another currency than kroner, kept on the wine (wines.retail_foreign, WIN-281): with the rate
 *  when the shop price was converted to kroner, without one when the host must type the price. */
export type RetailForeign = { amount: number; currency: string; rate: number | null };

/** What a link reading gives for wines.retail_foreign, or null when the price came in kroner or there was none. */
export function retailForeign(r: Partial<LinkResult>): RetailForeign | null {
  if (r.converted) return { amount: r.converted.amount, currency: r.converted.currency, rate: r.converted.rate };
  const p = r.shop_price;
  if (p && p.currency !== 'DKK' && r.price == null) return { amount: p.amount, currency: p.currency, rate: null };
  return null;
}

/** The note on the wine's shop price: "Regnet om fra 12,97 € (kurs 7,46)", or "Butikkens pris er 19,50 US$. Skriv
 *  prisen i kroner." when there is no fixed rate; null without a foreign price. */
export function retailForeignNote(f: RetailForeign | null | undefined): string | null {
  if (!f) return null;
  const price = formatCurrency(f.amount, f.currency);
  return f.rate != null
    ? t('link.converted', { price, rate: RATE.format(f.rate) })
    : t('link.foreignPrice', { price });
}
/** The same, as a sentence for the toast after a quick add ("Butiksprisen er regnet om fra 12,97 € (kurs 7,46).") */
export function retailForeignToast(f: RetailForeign | null | undefined): string | null {
  if (!f) return null;
  const price = formatCurrency(f.amount, f.currency);
  return f.rate != null
    ? t('link.convertedToast', { price, rate: RATE.format(f.rate) })
    : t('link.foreignPrice', { price });
}
// The rate in the site's Danish number format, as the amounts (7.46 → "7,46")
const RATE = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Asks Cloudflare AI where an unknown appellation lies and saves it (checked against the country in the database). */
export async function locateAppellation(appellation: string | null, region: string | null, country: string | null) {
  if (!appellation || !country) return;
  const list = await loadAppellations();
  if (matchAppellation(list, appellation)) return;
  const key = `${normOrigin(appellation)}|${country}`;
  const { data: known } = await supabase.from('appellation_guesses').select('key').eq('key', key).maybeSingle();
  if (known) return;
  try {
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch('/api/locate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
      body: JSON.stringify({ appellation, region, country }),
    });
    const r = (await res.json()) as { found?: boolean; lat?: number; lon?: number };
    if (r.found) {
      await supabase.rpc('save_place_guess', { name: appellation, country, lat: r.lat, lon: r.lon });
      forgetGuesses();
    }
  } catch { /* the wine is saved; the map falls back to the country */ }
}

