// A wine's picture is kept on our own storage (bucket wine-images), never only as a link to the shop: a shop that
// moves or removes the picture would leave the wine without one, and the guests' browsers would call the shop.
// A picture from a link is fetched through /api/fetch-image, shrunk here and stored under the host's folder.
import { supabase } from './supabase';

const BUCKET = 'wine-images';
const MAX_SIDE = 1200;

/** The picture is already ours (or there is none) */
export const isStored = (url: string | null | undefined) => !url || url.includes('/storage/v1/object/public/' + BUCKET + '/');

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

/** Smaller; a picture that may be transparent (png, webp, gif, avif) stays transparent: WebP, or PNG where the
 *  browser cannot write WebP. A photo (jpeg) stays JPEG. */
async function shrink(blob: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return null;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (/jpe?g/i.test(blob.type)) return toBlob(canvas, 'image/jpeg', 0.86);
  const webp = await toBlob(canvas, 'image/webp', 0.86);
  return webp?.type === 'image/webp' ? webp : toBlob(canvas, 'image/png');
}

/** Stores a picture from a web address; its address on our storage, or null when it cannot be fetched */
export async function storeImage(url: string, hostId: string): Promise<string | null> {
  if (isStored(url)) return url;
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch('/api/fetch-image', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const small = await shrink(await res.blob());
    if (!small) return null;
    const ext = small.type === 'image/webp' ? 'webp' : small.type === 'image/png' ? 'png' : 'jpg';
    const path = `${hostId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, small, { contentType: small.type, upsert: false });
    return error ? null : supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch { return null; }
}

/** Moves the pictures of wines that still link to a shop onto our storage, one at a time, quietly (wines saved
 *  before pictures were kept). Calls back with each wine that got its own copy. */
export async function storeLinkedImages<W extends { id: number; image_url: string | null }>(wines: W[], hostId: string, done?: (w: W) => void) {
  for (const w of wines) {
    const old = w.image_url;
    if (isStored(old)) continue;
    const url = await storeImage(old!, hostId);
    if (!url) continue;
    const { error } = await supabase.from('wines').update({ image_url: url }).eq('id', w.id).eq('image_url', old!);
    if (!error) { w.image_url = url; done?.(w); }
  }
}
