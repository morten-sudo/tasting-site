// Official pictures of a wine from its producer's own website (hosts only). The host picks the right one in the form.
// 1. Pages about the wine: links on the home page and URLs in the sitemap whose words match the wine's name.
// 2. Their pictures: the page's share picture, the product picture in its data, and <img> whose file name or alt text
//    names the wine. Bottle shots count in favour; logos, icons, cases and gift boxes against.
import { isHost, json } from '../../src/server/wine-ai';
import { cleanUrl, htmlToText, NOT_BOTTLE, BOTTLE } from './read-link';

const UA = 'Mozilla/5.0 (compatible; Winetastr/1.0; +https://winetastr.com)';
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const wordsOf = (s: string) => plain(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
const STOP = new Set(['the', 'and', 'des', 'les', 'del', 'della', 'chateau', 'domaine', 'wine', 'wines', 'vin', 'vino', 'red', 'white', 'rouge', 'blanc']);

async function get(url: string, ms = 7000): Promise<{ url: string; html: string } | null> {
  const u = cleanUrl(url);
  if (!u) return null;
  try {
    const res = await fetch(u.href, { headers: { 'user-agent': UA, accept: 'text/html,application/xml', 'accept-language': 'en,fr;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!res.ok) return null;
    return { url: res.url || u.href, html: (await res.text()).slice(0, 1_500_000) };
  } catch { return null; }
}

/** A picture's width and height, read from the first bytes of the file (PNG, JPEG, WebP, GIF) – cheap, no decoding. */
async function imageSize(url: string): Promise<{ w: number; h: number } | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, range: 'bytes=0-65535' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok && res.status !== 206) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 65536) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const b = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) { b.set(c.subarray(0, Math.min(c.length, size - o)), o); o += c.length; }
    const u16 = (i: number) => (b[i] << 8) | b[i + 1];
    const le16 = (i: number) => b[i] | (b[i + 1] << 8);
    const le24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
    if (b[0] === 0x89 && b[1] === 0x50) return { w: (u16(16) << 16) | u16(18), h: (u16(20) << 16) | u16(22) }; // PNG
    if (b[0] === 0x47 && b[1] === 0x49) return { w: le16(6), h: le16(8) }; // GIF
    if (b[0] === 0x52 && b[8] === 0x57) { // WebP
      const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (kind === 'VP8X') return { w: le24(24) + 1, h: le24(27) + 1 };
      if (kind === 'VP8 ') return { w: le16(26) & 0x3fff, h: le16(28) & 0x3fff };
      if (kind === 'VP8L') { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
      return null;
    }
    if (b[0] === 0xff && b[1] === 0xd8) { // JPEG: the frame header
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16(i + 7), h: u16(i + 5) };
        i += 2 + u16(i + 2);
      }
    }
    return null;
  } catch { return null; }
}

/** A bottle shot is tall and narrow (a whole bottle standing); scenes, glasses, vineyards and cases are wider. */
/** The shop system's own product pictures for a product page (the page itself often loads them by script):
 *  Magento (GraphQL by url key), Shopify (/products/<handle>.json) and WooCommerce (Store API by slug). */
const shopNotes: string[] = []; // what the shop systems answered (for checking)
async function shopPictures(pageUrl: string, html: string): Promise<{ urls: string[]; via: string } | null> {
  const u = new URL(pageUrl);
  const slug = u.pathname.split('/').filter(Boolean).pop()?.replace(/\.html?$/, '') ?? '';
  if (!slug) return null;
  const urls = (list: unknown[]) => list.map((x) => (typeof x === 'string' ? x : (x as { url?: string; src?: string })?.url ?? (x as { src?: string })?.src))
    .filter((x): x is string => !!x && /^https?:/.test(x) && !/placeholder/i.test(x));
  try {
    if (/\/products\//.test(u.pathname)) { // Shopify
      const r = await fetch(`${u.origin}/products/${slug}.json`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const p = ((await r.json()) as { product?: { images?: { src: string }[] } }).product;
        const list = urls(p?.images ?? []);
        if (list.length) return { urls: list, via: 'Shopify' };
      }
    }
    // Magento: its marks in the page (also written JSON-escaped, \u002Fmedia\u002Fcatalog), or a product address ending in .html
    if (/media.{0,6}catalog|mage-|magento|static.{0,6}version|graphql/i.test(html) || /\.html?$/.test(u.pathname)) { // Magento
      const query = `{products(filter:{url_key:{eq:${JSON.stringify(slug)}}}){items{name image{url} small_image{url} media_gallery{url}}}}`;
      // The store view is often the language in the address (/fr/…)
      const store = u.pathname.split('/').filter(Boolean)[0];
      const r = await fetch(`${u.origin}/graphql`, { method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/json', ...(store && store.length <= 5 ? { store } : {}) }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(6000) });
      const peek = await r.clone().text().catch(() => '');
      shopNotes.push(`${slug}: graphql ${r.status} ${peek.slice(0, 120).replace(/\s+/g, ' ')}`);
      if (r.ok) {
        const it = ((await r.json()) as { data?: { products?: { items?: { image?: { url: string }; small_image?: { url: string }; media_gallery?: { url: string }[] }[] } } }).data?.products?.items?.[0];
        const list = urls([...(it?.media_gallery ?? []), it?.image, it?.small_image].filter(Boolean) as unknown[]);
        if (list.length) return { urls: [...new Set(list)], via: 'Magento' };
      }
    }
    if (/wp-content|woocommerce/i.test(html)) { // WooCommerce
      const r = await fetch(`${u.origin}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const p = ((await r.json()) as { images?: { src: string }[] }[])[0];
        const list = urls(p?.images ?? []);
        if (list.length) return { urls: list, via: 'WooCommerce' };
      }
    }
  } catch {}
  return null;
}

const sizes: string[] = []; // what was measured (for checking)
async function isBottleShot(url: string): Promise<boolean> {
  const s = await imageSize(url);
  sizes.push(`${url.split('/').pop()?.slice(0, 40)} ${s ? `${s.w}x${s.h}` : 'unknown'}`);
  return !!s && s.h >= 250 && s.h >= s.w * 1.5;
}

const abs = (src: string, base: string) => { try { const u = new URL(src.replace(/&amp;/g, '&'), base); if (u.protocol === 'http:') u.protocol = 'https:'; return u.href; } catch { return null; } };
const fileWords = (url: string) => { try { return plain(decodeURIComponent(new URL(url).pathname)).replace(/[^a-z0-9]+/g, ' '); } catch { return ''; } };

export const onRequestPost = async ({ request }: { request: Request }) => {
  if (!(await isHost(request))) return json({ error: 'not_host' }, 403);
  let body: { name?: string; producer?: string; vintage?: string; website?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const site = cleanUrl(String(body.website ?? ''));
  if (!site) return json({ error: 'no_website' }, 400);
  const producerWords = new Set(wordsOf(String(body.producer ?? '')));
  // The words that tell this wine from the producer's others, e.g. "Mâcon-Villages" → macon, villages
  const key = wordsOf(String(body.name ?? '')).filter((w) => !producerWords.has(w) && !STOP.has(w) && !/^\d{4}$/.test(w));
  const all = key.length ? key : wordsOf(String(body.name ?? '')).filter((w) => !STOP.has(w));
  if (!all.length) return json({ images: [], pages: [] });
  const fits = (s: string) => { const t = ' ' + plain(s).replace(/[^a-z0-9]+/g, ' ') + ' '; return all.filter((w) => t.includes(` ${w} `)).length; };

  // 1. Pages about the wine: links on the home page, then URLs in the sitemap
  const home = await get(site.href);
  if (!home) return json({ images: [], pages: [], error: 'unreachable' });
  const host = new URL(home.url).hostname;
  const found = new Map<string, number>();
  const note = (href: string, text: string) => {
    const u = abs(href, home.url);
    if (!u || new URL(u).hostname !== host || /\.(jpe?g|png|webp|gif|pdf|svg)$/i.test(u)) return;
    // Every word of the wine must be there: "Beaujolais-Villages" is not the page of a "Mâcon-Villages"
    const n = fits(text + ' ' + decodeURIComponent(new URL(u).pathname).replace(/[-_/.]+/g, ' '));
    if (n === all.length) {
      const k = u.split('#')[0];
      // the shorter address first: …/macon-villages.html rather than …/macon-villages-magnum.html
      found.set(k, Math.max(found.get(k) ?? 0, 100 - k.length / 10));
    }
  };
  const linksOf = (html: string) => [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)].map((m) => ({ href: m[1], text: htmlToText(m[2]) }));
  const homeLinks = linksOf(home.html);
  for (const l of homeLinks) note(l.href, l.text);
  // One level deeper: the producer's list of wines ("Nos vins", "Our wines", "Gamme", "Collection" …)
  const LIST = /(^|[^a-z])(vins|nos vins|wines|our wines|wine|vini|i vini|weine|unsere weine|vinos|vinhos|gamme|collection|collections|produits|products|range|cuvees|cuvee|shop|boutique|tienda|negozio|sortiment)([^a-z]|$)/;
  const lists = [...new Set(homeLinks.filter((l) => LIST.test(plain(l.text + ' ' + l.href).replace(/[-_/]+/g, ' ')))
    .map((l) => abs(l.href, home.url)).filter((u): u is string => !!u && new URL(u).hostname === host))].slice(0, 4);
  for (const l of await Promise.all(lists.map((u) => get(u, 6000)))) if (l) for (const x of linksOf(l.html)) note(x.href, x.text);
  const seen: string[] = [`home ${home.url}: ${homeLinks.length} links; wine lists: ${lists.join(' ') || 'none'}`];
  if (found.size < 3) {
    const robots = await get(new URL('/robots.txt', home.url).href, 4000);
    const fromRobots = [...(robots?.html.matchAll(/^\s*sitemap:\s*(\S+)/gim) ?? [])].map((m) => m[1]);
    const maps = [...new Set([...fromRobots, new URL('/sitemap.xml', home.url).href, new URL('/sitemap_index.xml', home.url).href, new URL('/wp-sitemap.xml', home.url).href])].slice(0, 5);
    for (const sm of maps) {
      const x = await get(sm, 5000);
      if (!x || !/<(urlset|sitemapindex)/i.test(x.html)) { seen.push(`${sm}: none`); continue; }
      const locs = [...x.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      // A sitemap of sitemaps: the ones about products or wines first
      const subs = locs.filter((l) => /\.xml/i.test(l)).sort((a, b) => Number(/product|wine|vin|vini|wein/i.test(b)) - Number(/product|wine|vin|vini|wein/i.test(a))).slice(0, 4);
      const pages = locs.filter((l) => !/\.xml/i.test(l));
      for (const s of subs) {
        const y = await get(s, 5000);
        if (y) pages.push(...[...y.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).filter((l) => !/\.xml/i.test(l)));
      }
      for (const p of pages) note(p, '');
      seen.push(`${sm}: ${pages.length} pages, ${subs.length} sitemaps read`);
      break;
    }
  }
  const pages = [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([u]) => u);

  // 2. The pictures on those pages, best first. Only a picture whose file name or alt text names the wine counts;
  //    the page's share picture is the fallback (on many shops it shows another wine of the range).
  const images = new Map<string, { url: string; page: string; score: number }>();
  const shares: { url: string; page: string }[] = [];
  const looked: string[] = []; // every picture address seen (for checking why none was chosen)
  // Pictures that do not name the wine (many sites use numbers as file names), from the wine's own page: shown when no named one is found
  const unnamed: { url: string; page: string; score: number }[] = [];
  const unjson = (v: string) => { try { return JSON.parse(`"${v}"`) as string; } catch { return v.replace(/\\\//g, '/'); } };
  const add = (src: string | undefined, page: string, alt: string) => {
    if (!src) return;
    const u = abs(unjson(src.trim()).split(/\s+/)[0], page);
    if (!u || !/^https:/.test(u) || /\.svg(\?|$)/i.test(u) || /(logo|icon|sprite|favicon|placeholder|loader|flag|banner|header|background|avatar)/i.test(fileWords(u))) return;
    if (looked.length < 40 && !looked.includes(u)) looked.push(alt ? `${u} [${alt.slice(0, 60)}]` : u);
    const name = fileWords(u) + ' ' + plain(alt);
    const named = fits(name);
    if (!named) {
      // A transparent PNG or a shop's product picture is most often the bottle shot
      if (!NOT_BOTTLE.test(name) && !unnamed.some((x) => x.url === u && x.page === page)) {
        unnamed.push({ url: u, page, score: (/\.png(\?|$)/i.test(u) ? 2 : /\.webp(\?|$)/i.test(u) ? 1 : 0) + (/\/(catalog\/product|products?|wp-content\/uploads)\//i.test(u) ? 3 : 0) - pages.indexOf(page) * 0.5 });
      }
      return;
    }
    let score = named * 3 + (BOTTLE.test(name) ? 2 : 0) - (NOT_BOTTLE.test(name) ? 6 : 0);
    const size = u.match(/(\d{2,4})x(\d{2,4})/);
    if (size && Number(size[1]) < 150) score -= 4; // a thumbnail
    const key = u.replace(/[?#].*$/, '');
    const prev = images.get(key);
    if (!prev || prev.score < score || (prev.score === score && u.length > prev.url.length)) images.set(key, { url: u, page, score });
  };
  for (const page of pages) {
    const got = await get(page);
    if (!got) continue;
    const p = { ...got, url: page };
    // The shop's own pictures of this product: the surest source
    const shop = await shopPictures(page, got.html);
    if (shop) {
      seen.push(`${page}: ${shop.urls.length} pictures from ${shop.via}`);
      for (const [i, url] of shop.urls.entries()) {
        const key = url.replace(/[?#].*$/, '');
        const score = 20 - i - pages.indexOf(page) + (NOT_BOTTLE.test(fileWords(url)) ? -15 : 0);
        if (!images.has(key) || images.get(key)!.score < score) images.set(key, { url, page, score });
      }
    }
    const og = p.html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i)?.[1]
      ?? p.html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i)?.[1];
    const ogUrl = og && abs(og, p.url);
    if (ogUrl) shares.push({ url: ogUrl, page: p.url });
    // <img>, with its alt text
    for (const m of p.html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      const alt = tag.match(/\balt=["']([^"']*)/i)?.[1] ?? '';
      for (const v of [tag.match(/\b(?:data-src|data-lazy-src|src)=["']([^"']+)/i)?.[1], ...(tag.match(/\b(?:data-srcset|srcset)=["']([^"']+)/i)?.[1]?.split(',') ?? [])]) add(v, p.url, alt);
    }
    // Every other picture address in the page: srcset of <picture>, CSS, script data and JSON (galleries built by script)
    for (const m of p.html.slice(0, 400_000).matchAll(/((?:https?:)?(?:\\?\/){2}[^"'\s()<>]+?|(?:\\?\/)[^"'\s()<>:]+?)\.(?:png|jpe?g|webp)(?:\?[^"'\s()<>]*)?/gi)) add(m[0], p.url, '');
  }
  let list = [...images.values()].filter((i) => i.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  if (!list.length) {
    // A picture on several of the wine's pages belongs to the site, not to the wine
    const on = (u: string) => new Set(unnamed.filter((x) => x.url === u).map((x) => x.page)).size;
    const own = unnamed.filter((x, i) => unnamed.findIndex((y) => y.url === x.url) === i && (pages.length < 2 || on(x.url) === 1));
    // Only a tall, narrow picture is kept: a bottle standing (the shape is read from the file's first bytes)
    const checked = await Promise.all(own.sort((a, b) => b.score - a.score).slice(0, 12).map(async (x) => ((await isBottleShot(x.url)) ? x : null)));
    list = checked.filter(Boolean).slice(0, 6) as typeof list;
  }
  if (!list.length) list = shares.filter((x, i) => shares.findIndex((y) => y.url === x.url) === i).slice(0, 3).map((x) => ({ ...x, score: 0 }));
  // pages and seen show where the pictures came from (and why there are none)
  return json({ images: list.map(({ url, page }) => ({ url, page })), pages, seen, words: all, looked: looked.filter((x) => !x.startsWith('data:')).slice(0, 15), sizes: sizes.splice(0), shop: shopNotes.splice(0) });
};
