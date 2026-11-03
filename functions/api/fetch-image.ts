// Cloudflare Pages Function: POST /api/fetch-image  { url }
// Fetches a wine's picture from a shop or producer page so the host's browser can shrink it and store it with
// the wine (src/lib/wine-image.ts) – a picture on our own storage does not vanish when the shop moves it, and the
// guests' browsers never call the shop. Only signed-in hosts; only public http(s) addresses; only images.
import { isHost, json } from '../../src/server/wine-ai';
import { cleanUrl } from './read-link';

const MAX_BYTES = 8_000_000;
const UA = 'Mozilla/5.0 (compatible; Winetastr/1.0; +https://winetastr.com)';

export const onRequestPost = async ({ request }: { request: Request }) => {
  if (!(await isHost(request))) return json({ error: 'not_host' }, 401);
  let url: URL | null = null;
  try { url = cleanUrl(String(((await request.json()) as { url?: unknown }).url ?? '')); } catch { /* bad body */ }
  if (!url) return json({ error: 'bad_url' }, 400);
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { 'user-agent': UA, accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  } catch { return json({ error: 'unreachable' }, 502); }
  if (!res.ok) return json({ error: 'status', status: res.status }, 502);
  const type = res.headers.get('content-type') ?? '';
  if (!/^image\/(jpeg|png|webp|gif|avif)/i.test(type)) return json({ error: 'not_image' }, 415);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return json({ error: 'too_big' }, 413);
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return json({ error: 'too_big' }, 413);
  return new Response(body, { headers: { 'content-type': type, 'cache-control': 'no-store' } });
};
