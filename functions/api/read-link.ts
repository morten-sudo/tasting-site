// Cloudflare Pages Function: POST /api/read-link  { url, lang }
// Fetches a shop's product page for a wine, collects what the page states about it
// (structured data, Open Graph tags, Shopify product data and the page text) and lets
// the AI model in Workers AI turn it into wine fields. Only signed-in hosts may call it.
import { MODEL, FIELDS_SPEC, isHost, json, parseAnswer, str, toFields, type AiEnv, meteredAi, logLinkRead, overDailyLimit } from '../../src/server/wine-ai';
import { cleanUrl, safeFetch } from '../../src/server/safe-fetch';

const MAX_HTML = 2_000_000;
const MAX_TEXT = 9_000;
const LANG_NAMES: Record<string, string> = { da: 'Danish', en: 'English', is: 'Icelandic', fr: 'French', de: 'German', it: 'Italian', es: 'Spanish', nl: 'Dutch', pl: 'Polish' };
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

// Shops often show the wine's case, gift box or a set next to the bottle (Supervin: …_kasse_….jpg).
// The first picture (the shop's main one comes first) that does not look like one of those wins; failing that, the first.
export const NOT_BOTTLE = /(^|[^a-z])(kasse|kasser|box|boks|case|cases|karton|carton|gave|gift|geschenk|coffret|caisse|kiste|aeske|æske|pack|bundle|set|etui|tube|glas|glass|label|etiket)([^a-z]|$)/i;
export const BOTTLE = /(^|[^a-z])(flaske|bottle|bouteille|flasche|bottiglia|botella|fles|packshot)([^a-z]|$)/i;
function pickImage(urls: string[]): string | null {
  const seen = [...new Set(urls)];
  const name = (u: string) => { try { return decodeURIComponent(new URL(u).pathname.split('/').pop() ?? ''); } catch { return u; } };
  return seen.find((u) => !NOT_BOTTLE.test(name(u))) ?? seen[0] ?? null;
}

// Pages without a shared picture (no og:image or structured data, e.g. Drupal shops like viniportugal.dk): the page's
// own <img>s that look like the product – the file name or alt text shares words with the wine's name, or the path
// says bottle/product – never logos, icons, flags, payment badges or SVGs. Best match first.
const SKIP_IMG = /(logo|icon|sprite|flag|flags|payment|mobilepay|visa|mastercard|banner|avatar|placeholder|spinner|loader|badge|trustpilot|facebook|instagram)/i;
export function pageImages(html: string, base: URL, names: string[]): string[] {
  const words = new Set(names.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const found: { url: string; score: number; i: number }[] = [];
  let i = 0;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (n: string) => tag.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    const src = attr('data-src') ?? attr('src') ?? attr('srcset')?.split(/\s+/)[0];
    const url = src && !src.startsWith('data:') ? absolute(decode(src), base) : null;
    if (!url || /\.svg(\?|$)/i.test(url) || SKIP_IMG.test(url)) continue;
    const text = (decodeURIComponent(url.split('?')[0]) + ' ' + (attr('alt') ?? '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hits = text.split(/[^a-z0-9]+/).filter((w) => words.has(w)).length;
    const score = hits * 2 + (BOTTLE.test(text) || /(product|produkt|wine|vin|bottle)/.test(text) ? 1 : 0);
    if (score >= 2) found.push({ url, score, i: i++ });
  }
  return found.sort((a, b) => b.score - a.score || a.i - b.i).map((f) => f.url);
}

function absolute(src: unknown, base: URL) {
  const s = str(typeof src === 'object' && src ? (src as Record<string, unknown>).url : src);
  if (!s) return null;
  try {
    const u = new URL(s.startsWith('//') ? 'https:' + s : s, base);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.href;
  } catch { return null; }
}

/** "eur" or "€" → "EUR", "kr." → "DKK"; null when it is not a currency. */
const SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP', '$': 'USD', 'KR': 'DKK', 'KR.': 'DKK', 'DKR': 'DKK', ',-': 'DKK' };
export const currencyCode = (v: unknown) => {
  const s = String(v ?? '').trim().toUpperCase();
  return SYMBOLS[s] ?? (/^[A-Z]{3}$/.test(s) ? s : null);
};

/** Kroner per unit of a currency with a fixed rate: the krone is pegged to the euro (ERM II, central rate 7,46038),
 *  so a euro price is converted at 7,46 (WIN-281). Other currencies float and are never converted. */
export const KRONER_PER: Record<string, number> = { DKK: 1, EUR: 7.46 };

const price = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
};

type Shopify = { title?: string; vendor?: string; body_html?: string; product_type?: string;
  images?: { src: string }[]; variants?: { title?: string; price: string; compare_at_price?: string | null }[] };

async function fetchText(url: string, accept: string) {
  // Every redirect is checked too (never on to a private address)
  const res = await safeFetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; Winetastr/1.0; +https://winetastr.com)',
      accept, 'accept-language': 'da,en;q=0.8',
    },
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
  const limited = await overDailyLimit(request, 'ai');
  if (limited) return limited;
  const lang = LANG_NAMES[body.lang ?? ''] ? body.lang! : 'da';

  let html: string;
  try { html = await fetchText(url.href, 'text/html,application/xhtml+xml'); }
  catch { await logLinkRead(request, url.href, 'fetch_failed'); return json({ error: 'fetch_failed' }, 502); }

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

  // The currency the page states for its prices (structured data); the model's reading of the page text is the fallback
  const pageCurrency = currencyCode(offers?.priceCurrency ?? meta['og:price:currency'] ?? meta['product:price:currency'] ?? meta['pricecurrency']);

  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const parts = [
    `URL: ${url.href}`,
    title && `Page title: ${title}`,
    meta['og:title'] && `Title: ${meta['og:title']}`,
    str(product.name) && `Product name: ${product.name}`,
    shop?.title && `Product name: ${shop.title}`,
    shop?.vendor && `Vendor: ${shop.vendor}`,
    shop?.product_type && `Product type: ${shop.product_type}`,
    shop?.variants?.length && `Variants (title: price, before: regular price):\n` + shop.variants
      .map((v) => `- ${v.title ?? ''}: ${v.price}${v.compare_at_price ? `, before ${v.compare_at_price}` : ''}`).join('\n'),
    str(first(product.brand) && (first(product.brand) as Record<string, unknown>).name) &&
      `Brand: ${(first(product.brand) as Record<string, unknown>).name}`,
    (meta['og:description'] || meta['description']) && `Summary: ${meta['og:description'] || meta['description']}`,
    str(product.description) && `Description: ${htmlToText(String(product.description))}`,
    shop?.body_html && `Description: ${htmlToText(shop.body_html)}`,
    pageCurrency && `Currency of the prices: ${pageCurrency}`,
    `Page text:\n${htmlToText(html)}`,
  ].filter(Boolean).join('\n');
  const text = parts.slice(0, MAX_TEXT);

  const prompt = `Below is text from a web shop's product page for a wine. Return ONLY a JSON object with these keys:
${FIELDS_SPEC},
"regular_price": the normal, non-discounted price for ONE bottle as a number, in the currency the page shows it in (often shown crossed out or as "normal price"/"vejl. pris"), or null,
"offer_price": a discounted price per bottle as a number in the same currency, or null,
"currency": the ISO 4217 code of the currency of those prices (e.g. "DKK" for kr./DKK, "EUR" for €), or null,
"offer_quantity": how many bottles must be bought to get offer_price (1 if it applies to a single bottle), or null,
"description": two or three sentences in ${LANG_NAMES[lang]} about the wine's style and taste, written in your own words – do not copy sentences from the page, and leave out prices, discounts, points and marketing,
"food": the dishes the page suggests the wine with, as a short comma-separated list in ${LANG_NAMES[lang]} (e.g. "grilled fish, salads, cheese"), or null,
"serving": how to serve it as the page says, in ${LANG_NAMES[lang]}: the temperature written like "10–12 °C", and briefly any advice such as decanting or the glass, or null.
Use only what the page states. Use null when unsure. No other text.

${text}`;

  let answer: Record<string, unknown> | null = null;
  try {
    const out = await meteredAi(env, request, 'link').run(MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.1,
    });
    answer = parseAnswer(out.response);
  } catch {
    return json({ error: 'model_failed' }, 502);
  }
  if (!answer) { await logLinkRead(request, url.href, 'unreadable'); return json({ error: 'unreadable' }, 422); }

  // The shop's own main picture (what it shares and marks as the product's image) comes before its gallery,
  // which can hold the back label or a detail first; all of them are returned so the host can pick another
  const abs = (xs: unknown[]) => xs.map((x) => absolute(x, url)).filter(Boolean) as string[];
  const fromOg = abs([meta['og:image:secure_url'], meta['og:image']]);
  const fromLd = abs(Array.isArray(product.image) ? product.image : [product.image]);
  const fromShop = abs((shop?.images ?? []).map((i) => i.src));
  const pictures = [...fromOg, ...fromLd, ...fromShop];
  if (!pictures.length) pictures.push(...pageImages(html, url, [title, meta['og:title'], str(product.name), str(answer.name)].filter(Boolean) as string[]).slice(0, 8));
  // Logged for the superadmin: where the picture came from, or that the page gave none
  const source = fromOg.length ? 'og' : fromLd.length ? 'jsonld' : fromShop.length ? 'shopify' : pictures.length ? 'page' : 'none';
  let image = pickImage(pictures);
  const images = [...new Set(pictures)].filter((u) => !NOT_BOTTLE.test(decodeURIComponent(u.split('/').pop() ?? ''))).slice(0, 8);
  // Vivino shares a close crop of the label (…_pl_375x500.png); the bottle shot (…_pb_x600.png) suits the wine card
  const bottle = image?.match(/^(https:\/\/images\.vivino\.com\/thumbs\/[\w-]+)_pl_\d+x\d+\.png$/)?.[1];
  if (bottle) {
    try {
      const res = await safeFetch(`${bottle}_pb_x600.png`, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
      if (res.ok) image = `${bottle}_pb_x600.png`;
    } catch {}
  }
  // Regular price per bottle: what the page calls the normal price, else the structured price – in the shop's currency
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
  // The wine's prices are kroner (WIN-281, Morten 6 November 2026): a euro price is converted at the fixed rate and
  // the host is told on the wine ("Regnet om fra 12,97 € (kurs 7,46)"); another currency has no fixed rate, so its
  // price is left for the host to type. A page that states no currency at all is taken as kroner (Danish shops often
  // leave it out).
  const currency = pageCurrency ?? currencyCode(answer.currency) ?? 'DKK';
  const rate = KRONER_PER[currency] ?? null;
  const kr = (n: number | null) => (n == null || rate == null ? null : Math.round(n * rate * 100) / 100);

  await logLinkRead(request, url.href, source, images.length || (image ? 1 : 0), str(answer.name));
  return json({
    ...toFields(answer, [title, meta['og:title'], str(product.name), shop?.title].filter(Boolean) as string[]),
    description: str(answer.description),
    food: str(answer.food),
    serving: str(answer.serving)?.slice(0, 300) ?? null,
    image,
    images,
    // In kroner (converted from euro); null when the shop shows a currency without a fixed rate
    price: kr(shopPrice),
    offer: offer && rate != null ? { ...offer, price: kr(offer.price)! } : null,
    // The shop's own price and currency, as the page shows it
    shop_price: shopPrice != null ? { amount: shopPrice, currency } : null,
    // A price in another currency than kroner (the wine keeps it as retail_foreign, with the rate when converted)
    foreign_currency: currency !== 'DKK' && shopPrice != null ? currency : null,
    converted: currency !== 'DKK' && rate != null && shopPrice != null ? { amount: shopPrice, currency, rate } : null,
    source_url: url.href,
  });
};
