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

  // 2. The pictures on those pages, best first
  const images = new Map<string, { url: string; page: string; score: number }>();
  const add = (src: string | undefined, page: string, alt: string, base: number) => {
    if (!src) return;
    const u = abs(src.trim().split(/\s+/)[0], page);
    if (!u || /\.svg(\?|$)/i.test(u) || /(logo|icon|sprite|favicon|placeholder|loader|flag|banner|header|background)/i.test(fileWords(u))) return;
    const name = fileWords(u) + ' ' + plain(alt);
    const named = fits(name);
    if (!named && base < 2) return; // another wine's picture on the page
    let score = base + named * 3 + (BOTTLE.test(name) ? 2 : 0) - (NOT_BOTTLE.test(name) ? 6 : 0);
    if (/(\d{2,4})x(\d{2,4})/.test(u)) { const [, w] = u.match(/(\d{2,4})x(\d{2,4})/)!; if (Number(w) < 150) score -= 4; }
    const prev = images.get(u);
    if (!prev || prev.score < score) images.set(u, { url: u, page, score });
  };
  for (const page of pages) {
    const p = await get(page);
    if (!p) continue;
    const og = p.html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i)?.[1]
      ?? p.html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i)?.[1];
    add(og, p.url, '', 2);
    const unjson = (v: string) => { try { return JSON.parse(`"${v}"`) as string; } catch { return v.replace(/\\\//g, '/'); } };
    for (const m of p.html.matchAll(/"image"\s*:\s*(?:\[\s*)?"([^"]+)"/g)) add(unjson(m[1]), p.url, '', 2);
    for (const m of p.html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      const src = tag.match(/\b(?:data-src|data-lazy-src|src)=["']([^"']+)/i)?.[1];
      const set = tag.match(/\b(?:data-srcset|srcset)=["']([^"']+)/i)?.[1];
      const biggest = set?.split(',').map((x) => x.trim().split(/\s+/)).sort((a, b) => parseInt(b[1] ?? '0') - parseInt(a[1] ?? '0'))[0]?.[0];
      const alt = tag.match(/\balt=["']([^"']*)/i)?.[1] ?? '';
      add(biggest ?? src, p.url, alt, 0);
    }
  }
  const list = [...images.values()].filter((i) => i.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  // pages and seen show where the pictures came from (and why there are none)
  return json({ images: list.map(({ url, page }) => ({ url, page })), pages, seen, words: all });
};
