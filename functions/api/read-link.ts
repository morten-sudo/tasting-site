// Cloudflare Pages Function: POST /api/read-link  { url, lang }
// Fetches a shop's product page for a wine, collects what the page states about it
// (structured data, Open Graph tags, Shopify product data and the page text) and lets
// the AI model in Workers AI turn it into wine fields. Only signed-in hosts may call it.
import { MODEL, FIELDS_SPEC, isHost, json, parseAnswer, str, toFields, type AiEnv } from '../../src/server/wine-ai';

const MAX_HTML = 2_000_000;
const MAX_TEXT = 9_000;
const LANG_NAMES: Record<string, string> = { da: 'Danish', en: 'English', is: 'Icelandic', fr: 'French', de: 'German', it: 'Italian' };
const TRACKING = /^(utm_|gad_|gclid|gbraid|wbraid|fbclid|mc_|_ga|srsltid)/i;

/** Only public http(s) addresses; tracking parameters removed. */
export function cleanUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
      /^(127|10|0)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^\[?::1\]?$|^\[?f[cd]/.test(host)) return null;
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.hash = '';
  return u;
}

const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

export function htmlToText(html: string) {
  return decode(html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/dd|\/dt)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function metaTags(html: string) {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (key && content && !(key in out)) out[key] = decode(content);
  }
  return out;
}

/** schema.org Product objects from JSON-LD blocks (also inside @graph). */
function jsonLdProducts(html: string) {
  const found: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const type = o['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) found.push(o);
    if (o['@graph']) walk(o['@graph']);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch {}
  }
  return found;
}

const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

function absolute(src: unknown, base: URL) {
  const s = str(typeof src === 'object' && src ? (src as Record<string, unknown>).url : src);
  if (!s) return null;
  try {
    const u = new URL(s.startsWith('//') ? 'https:' + s : s, base);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.href;
  } catch { return null; }
}

const price = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
};

type Shopify = { title?: string; vendor?: string; body_html?: string; product_type?: string;
  images?: { src: string }[]; variants?: { title?: string; price: string; compare_at_price?: string | null }[] };

async function fetchText(url: string, accept: string) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; Winetastr/1.0; +https://winetastr.krusesoendergaard.dk)',
      accept, 'accept-language': 'da,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const text = await res.text();
  return text.length > MAX_HTML ? text.slice(0, MAX_HTML) : text;
}

export const onRequestPost = async ({ request, env }: { request: Request; env: AiEnv }) => {
  if (!(await isHost(request))) return json({ error: 'not_host' }, 403);

  let body: { url?: string; lang?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const url = cleanUrl(String(body.url ?? ''));
  if (!url) return json({ error: 'bad_url' }, 400);
  const lang = LANG_NAMES[body.lang ?? ''] ? body.lang! : 'da';

  let html: string;
  try { html = await fetchText(url.href, 'text/html,application/xhtml+xml'); }
  catch { return json({ error: 'fetch_failed' }, 502); }

  const meta = metaTags(html);
  const product = jsonLdProducts(html)[0] ?? {};
  const offers = first(product.offers) as Record<string, unknown> | undefined;

  // Shopify shops publish the product as JSON at <product url>.json
  let shop: Shopify | null = null;
  if (/\/products\/[^/]+\/?$/.test(url.pathname) && /shopify/i.test(html)) {
    try {
      const data = JSON.parse(await fetchText(`${url.origin}${url.pathname.replace(/\/$/, '')}.json`, 'application/json'));
      shop = (data?.product ?? null) as Shopify | null;
    } catch {}
  }

  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const parts = [
    `URL: ${url.href}`,
    title && `Page title: ${title}`,
    meta['og:title'] && `Title: ${meta['og:title']}`,
    str(product.name) && `Product name: ${product.name}`,
    shop?.title && `Product name: ${shop.title}`,
    shop?.vendor && `Vendor: ${shop.vendor}`,
    shop?.product_type && `Product type: ${shop.product_type}`,
    shop?.variants?.length && `Variants (title: price DKK, before: regular price):\n` + shop.variants
      .map((v) => `- ${v.title ?? ''}: ${v.price}${v.compare_at_price ? `, before ${v.compare_at_price}` : ''}`).join('\n'),
    str(first(product.brand) && (first(product.brand) as Record<string, unknown>).name) &&
      `Brand: ${(first(product.brand) as Record<string, unknown>).name}`,
    (meta['og:description'] || meta['description']) && `Summary: ${meta['og:description'] || meta['description']}`,
    str(product.description) && `Description: ${htmlToText(String(product.description))}`,
    shop?.body_html && `Description: ${htmlToText(shop.body_html)}`,
    `Page text:\n${htmlToText(html)}`,
  ].filter(Boolean).join('\n');
  const text = parts.slice(0, MAX_TEXT);

  const prompt = `Below is text from a web shop's product page for a wine. Return ONLY a JSON object with these keys:
${FIELDS_SPEC},
"regular_price": the normal, non-discounted price for ONE bottle in DKK as a number (often shown crossed out or as "normal price"/"vejl. pris"), or null,
"offer_price": a discounted price per bottle in DKK as a number, or null,
"offer_quantity": how many bottles must be bought to get offer_price (1 if it applies to a single bottle), or null,
"description": two or three sentences in ${LANG_NAMES[lang]} about the wine's style and taste, written in your own words – do not copy sentences from the page, and leave out prices, discounts, points and marketing.
Use only what the page states. Use null when unsure. No other text.

${text}`;

  let answer: Record<string, unknown> | null = null;
  try {
    const out = await env.AI.run(MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.1,
    });
    answer = parseAnswer(out.response);
  } catch {
    return json({ error: 'model_failed' }, 502);
  }
  if (!answer) return json({ error: 'unreadable' }, 422);

  const image = absolute(shop?.images?.[0]?.src, url) ?? absolute(first(product.image), url) ??
    absolute(meta['og:image:secure_url'] ?? meta['og:image'], url);
  // Regular price per bottle: what the page calls the normal price, else the structured price
  const v0 = shop?.variants?.[0];
  const regular = price(answer.regular_price) ??
    (v0?.compare_at_price && price(v0.compare_at_price)! > price(v0.price)! && /^(1|default|1 ?stk\.?|1 ?fl\.?)?$/i.test((v0.title ?? '').trim().replace(/^default title$/i, ''))
      ? price(v0.compare_at_price) : null);
  const offerPrice = price(answer.offer_price);
  const offerQty = Number(answer.offer_quantity);
  const offer = offerPrice && (!regular || offerPrice < regular)
    ? { price: offerPrice, quantity: Number.isInteger(offerQty) && offerQty > 0 && offerQty < 100 ? offerQty : 1 }
    : null;
  const structured = price(offers?.price) ?? price(offers?.lowPrice) ??
    price(meta['og:price:amount'] ?? meta['product:price:amount']) ?? price(shop?.variants?.[0]?.price);
  // Never use the offer price as the regular price
  const shopPrice = regular ?? (offer && structured === offer.price ? null : structured);

  return json({
    ...toFields(answer, [title, meta['og:title'], str(product.name), shop?.title].filter(Boolean) as string[]),
    description: str(answer.description),
    image,
    price: shopPrice,
    offer,
    source_url: url.href,
  });
};
