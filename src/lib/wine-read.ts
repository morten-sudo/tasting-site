// Reading a wine from a photo of its label or a shop link (Cloudflare Workers AI via /api/read-label and
// /api/read-link), shared by the wine form and the quick "New wine" line above the lists.
import { supabase } from './supabase';
import { forgetGuesses } from './overview-map';
import { loadAppellations, matchAppellation, normOrigin } from './origin';

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
};
export type LinkResult = LabelResult & {
  description: string | null; image: string | null; images?: string[]; price: number | null; source_url: string;
  food?: string | null; serving?: string | null;
  offer: { price: number; quantity: number } | null; foreign_currency?: string | null;
};

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

