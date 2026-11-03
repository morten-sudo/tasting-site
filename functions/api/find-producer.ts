// Finds a wine producer's own website and, from it, where the producer is (hosts; the browser saves the result on the wine).
// 1. Candidate sites: Cloudflare AI's suggestions plus domains built from the producer's name (also the usual
//    forms such as champagne-bollinger.com, chateau-x.com, weingut-x.de).
// 2. Every candidate is checked and scored: it must name the producer and be about wine; the producer's name in
//    the domain or title, its region or appellation and the wine's name on the page count in its favour. The best wins.
// 3. The place: the site is crawled along its own links (and sitemap) to the contact and visit pages; coordinates in
//    the page or its text, an embedded map link, or the postal address in its data or as text.
import { MODEL, isHost, json, parseAnswer, str, type AiEnv, meteredAi, overDailyLimit } from '../../src/server/wine-ai';
import { htmlToText } from './read-link';
import { cleanUrl, safeFetch } from '../../src/server/safe-fetch';
import { geocodeAddress } from '../../src/server/geocode';

const UA = 'Mozilla/5.0 (compatible; Winetastr/1.0; +https://winetastr.com)';
const TLDS: Record<string, string[]> = {
  FR: ['fr'], PT: ['pt'], IT: ['it'], ES: ['es'], DE: ['de'], AT: ['at'], US: [], AU: ['com.au'], NZ: ['co.nz'],
  ZA: ['co.za'], CL: ['cl'], AR: ['com.ar'], GB: ['co.uk'],
};
const PREFIXES = /^(chateau|château|domaine|dom\.?|quinta|bodegas?|cantina|tenuta|weingut|maison|clos|castello|fattoria|azienda agricola|casa|vina|viña|cave)\s+/i;

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/ß/g, 'ss');
/** The distinctive words of a producer's name, e.g. "Château Malartic-Lagravière" → ["malartic", "lagraviere"]. */
const keyWords = (name: string) => plain(name.replace(PREFIXES, '')).split(/[^a-z0-9]+/)
  .filter((w) => w.length > 2 && !['des', 'del', 'les', 'and', 'the', 'wines', 'winery', 'vineyards', 'estate', 'family'].includes(w));

/** Words that put a page among wine producers' sites, in the wine countries' languages. */
const WINE_WORDS = ['wine', 'wines', 'winery', 'vineyard', 'vineyards', 'vintage', 'cellar', 'grape', 'grapes', 'harvest', 'tasting',
  'vin', 'vins', 'vignoble', 'vignobles', 'vigneron', 'vignerons', 'vendange', 'vendanges', 'cuvee', 'cuvees', 'millesime', 'domaine', 'chateau', 'champagne', 'degustation',
  'vino', 'vini', 'vigneto', 'vigneti', 'cantina', 'vendemmia', 'degustazione', 'bodega', 'bodegas', 'vinedo', 'vinedos', 'uva', 'cosecha',
  'wein', 'weine', 'weingut', 'weinberg', 'weinberge', 'rebsorte', 'jahrgang', 'quinta', 'vinho', 'vinhos', 'porto', 'vinha', 'vinhas',
  // grapes also tell a wine producer's site
  'nebbiolo', 'barbera', 'sangiovese', 'merlot', 'cabernet', 'chardonnay', 'pinot', 'syrah', 'shiraz', 'grenache', 'garnacha', 'riesling',
  'tempranillo', 'malbec', 'sauvignon', 'moscato', 'muscat', 'touriga', 'gruner', 'zinfandel', 'semillon', 'chenin', 'viognier', 'carmenere',
  // an age check in front of the site: only drinks producers have one
  'alcohol', 'alcool', 'alcol', 'alkohol', 'maggiorenne', 'drinking', 'majeur', 'majeure', 'vollendet', 'mayor de edad',
  'quando sei nato', 'data di nascita', 'date of birth', 'when were you born', 'date de naissance', 'geburtsdatum',
  'fecha de nacimiento', 'data de nascimento', 'legal drinking age'];

/** Domains to try, built from the name: kopke.com, chateau-belgrave.com, belgrave.fr, champagne-bollinger.com … */
function guessDomains(producer: string, country: string | null, region: string | null) {
  const full = plain(producer).replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  const core = plain(producer.replace(PREFIXES, '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  const stems = new Set([core.join(''), core.join('-'), full.join('-'), full.join('')].filter((s) => s.length > 2));
  // The usual forms of a producer's domain in its country or region, when the name does not already have them
  const kinds = [
    ...(/champagne/i.test(region ?? '') ? ['champagne'] : []),
    ...({ FR: ['chateau', 'domaine'], DE: ['weingut'], AT: ['weingut'], ES: ['bodegas'], IT: ['tenuta', 'cantina'], PT: ['quinta'] }[country ?? ''] ?? []),
  ];
  const c = core.join('');
  if (c.length > 2 && full.length === core.length) {
    for (const k of kinds) { stems.add(`${k}-${core.join('-')}`); stems.add(`${k}${c}`); }
    if (kinds.includes('champagne')) stems.add(`${core.join('-')}-champagne`);
  }
  const tlds = ['com', ...(TLDS[country ?? ''] ?? [])];
  return [...stems].flatMap((s) => tlds.map((t) => `https://www.${s}.${t}/`));
}

/** How well a page fits the producer: null when it is not the producer's (does not name it or is not about wine). */
function scorePage(page: { url: string; html: string }, words: string[], origin: string[], wineWords: string[]): { score: number | null; why: string } {
  const title = plain(htmlToText((page.html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? '') + ' '
    + (page.html.match(/property=["']og:site_name["'][^>]*content=["']([^"']{0,200})/i)?.[1] ?? '')));
  const text = ' ' + plain(htmlToText(page.html.slice(0, 300_000)).slice(0, 30_000) + ' ' + title).replace(/[^a-z0-9]+/g, ' ') + ' ';
  const has = (w: string) => text.includes(` ${w} `) || text.includes(` ${w}`);
  let host = '';
  try { host = plain(new URL(page.url).hostname); } catch {}
  // The whole name as the domain (neirano.com, bertranddemonceny.com) is a strong sign in itself
  const domain = host.replace(/^www\./, '').split('.')[0].replace(/-/g, '');
  const ownDomain = words.length > 0 && words.every((w) => domain.includes(w));
  const why = (named: boolean, wine: number) => `name ${named ? 'yes' : 'no'}${ownDomain ? ' (own domain)' : ''}, wine words ${wine}, ${text.length} chars`;
  if (!words.length || !(words.every(has) || ownDomain)) return { score: null, why: why(false, 0) }; // does not name the producer
  const inOrigin = origin.some((o) => text.includes(` ${o} `));
  // About wine: wine words or grapes, and the wine's region or appellation counts as two
  const wine = WINE_WORDS.filter((w) => text.includes(` ${w} `)).length + (inOrigin ? 2 : 0);
  // A page about something else that shares the name (bollinger.com is not the Champagne house)
  if (wine < (ownDomain ? 1 : 2)) return { score: null, why: why(true, wine) };
  return { why: why(true, wine), score: (words.some((w) => host.includes(w)) ? 3 : 0) + (words.every((w) => title.includes(w)) ? 2 : 0)
    + Math.min(wine, 6) / 2 + (inOrigin ? 3 : 0) + (wineWords.some((w) => has(w)) ? 1 : 0) };
}

// Why the last fetch of a URL failed (shown in "tried", to see why a site was not read)
const failed = new Map<string, string>();
const noteFailed = (url: string, why: string) => { if (failed.size > 500) failed.clear(); failed.set(url, why); };
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** A page's HTML. Some sites turn away anything that does not look like a browser: then once more as one. */
async function get(url: string, ms = 7000): Promise<{ url: string; html: string } | null> {
  const u = cleanUrl(url);
  if (!u) return null;
  for (const ua of [UA, BROWSER_UA]) {
    try {
      const res = await safeFetch(u.href, { headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'accept-language': 'en,fr;q=0.8,it;q=0.7,de;q=0.6' }, signal: AbortSignal.timeout(ms) });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok) { noteFailed(url, `http ${res.status}`); continue; }
      if (type && !type.includes('html')) { noteFailed(url, `type ${type.slice(0, 40)}`); return null; }
      const html = (await res.text()).slice(0, 1_500_000);
      failed.delete(url);
      return { url: res.url || u.href, html };
    } catch (e) { noteFailed(url, `error ${String(e).slice(0, 80)}`); }
  }
  return null;
}

/** Coordinates in the page: schema.org geo, geo meta tags, or map links (Google, Apple, Bing). */
function findCoords(html: string): { lat: number; lon: number; how: string } | null {
  const ok = (a: string, b: string, how: string) => {
    const lat = Number(a), lon = Number(b);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0) ? { lat, lon, how } : null;
  };
  const tries: [RegExp, string][] = [
    [/"latitude"\s*:\s*"?(-?\d+\.\d+)"?\s*,\s*"longitude"\s*:\s*"?(-?\d+\.\d+)/i, 'schema.org'],
    [/<meta[^>]+name=["']geo\.position["'][^>]+content=["'](-?\d+\.\d+)\s*[;,]\s*(-?\d+\.\d+)/i, 'meta'],
    [/<meta[^>]+name=["']ICBM["'][^>]+content=["'](-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i, 'meta'],
    [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, 'map link'],
    // An embedded Google map ("Share → Embed"): centred on the place, longitude (!2d) before latitude (!3d)
    [/google\.[a-z.]+\/maps\/embed\?pb=[^"'\s<>]*?!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/i, 'map embed'],
    [/google\.[a-z.]+\/maps[^"'\s<>]*@(-?\d+\.\d+),(-?\d+\.\d+)/i, 'map link'],
    [/maps[^"'\s<>]*[?&](?:q|ll|center|daddr|destination|query)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i, 'map link'],
    [/data-lat(?:itude)?=["'](-?\d+\.\d+)["'][^>]*data-(?:lng|lon|longitude)=["'](-?\d+\.\d+)/i, 'map data'],
    [/"lat"\s*:\s*(-?\d+\.\d{3,})\s*,\s*"(?:lng|lon)"\s*:\s*(-?\d+\.\d{3,})/i, 'map data'],
    // Written on the page: "GPS: 44.613474 7.965826", "Coordinates: 44.61, 7.96", "N 44.6134 E 7.9658"
    [/(?:gps|coordinate[s]?|coordinat[ea]|koordinaten|coordonn[ée]es|lat(?:itude)?)\s*[:.]?\s*N?\s*(-?\d{1,2}\.\d{4,})[°\s]*[,;\s/]+\s*(?:E|lon(?:gitude)?\s*[:.]?)?\s*(-?\d{1,3}\.\d{4,})/i, 'on the page'],
  ];
  for (const [re, how] of tries) {
    const m = html.match(re);
    const c = m && (how === 'map embed' ? ok(m[2], m[1], how) : ok(m[1], m[2], how));
    if (c) return c;
  }
  return null;
}

/** A postal address in the page's schema.org data (Organization, Winery, LocalBusiness …). */
function schemaAddress(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const stack: unknown[] = [data];
    while (stack.length) {
      const v = stack.pop();
      if (Array.isArray(v)) { stack.push(...v); continue; }
      if (!v || typeof v !== 'object') continue;
      const o = v as Record<string, unknown>;
      const a = o.address;
      if (typeof a === 'string' && a.trim().length > 8) return a.trim().slice(0, 300);
      if (a && typeof a === 'object' && !Array.isArray(a)) {
        const x = a as Record<string, unknown>;
        const country = typeof x.addressCountry === 'object' && x.addressCountry ? (x.addressCountry as Record<string, unknown>).name : x.addressCountry;
        const line = [x.streetAddress, [x.postalCode, x.addressLocality].filter((y) => typeof y === 'string' && y.trim()).join(' '), country]
          .filter((y) => typeof y === 'string' && y.trim()).map((y) => String(y).trim()).join(', ');
        if (x.streetAddress || x.postalCode) return line.slice(0, 300);
      }
      stack.push(...Object.values(o).filter((y) => y && typeof y === 'object'));
    }
  }
  return null;
}

/** Place names written in map links, e.g. maps.google.com/?q=Château+Lynch-Bages,+33250+Pauillac */
function mapPlaces(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.apple\.com)[^"'\s<>]*?[?&](?:q|query|daddr|destination|address)=([^&"'<>]+)/gi)) {
    let v = m[1].replace(/\+/g, ' ');
    try { v = decodeURIComponent(v); } catch {}
    v = v.replace(/&amp;/g, '&').trim();
    if (v.length > 6 && v.length < 200 && !/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(v)) out.push(v);
    if (out.length >= 3) break;
  }
  return out;
}

// ---------- Crawling the producer's own site: follow its real links, not guessed addresses ----------
// How likely a link leads to the address, from its text and address (in the wine countries' languages)
const LINK_SCORE: [RegExp, number][] = [
  [/contact|kontakt|contato|contacto|contatti|contactos|impressum|mentions[- ]legales|legal notice|note legali|aviso legal|imprint/, 6],
  [/\b(visit|visite|visita|besuch|degustaz|tasting|dove siamo|where|find[- ]us|location|localiza|come[- ]to|onde|acces|plan d.acces|venir|trouver|map|mappa|karte|anfahrt)\b/, 4],
  [/about|azienda|chi[- ]siamo|storia|history|histoire|qui sommes|nosotros|quem somos|uber uns|ueber uns|weingut|cantina|domaine|bodega|quinta|estate/, 2],
];
const SKIP = /\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|xml)(\?|$)|^mailto:|^tel:|^javascript:|\/(cart|basket|checkout|account|login|wp-admin|feed)\b|[?&](error|add-to-cart|lang)=/i;

/** The site's own links that may lead to the address, best first – read from the page itself. */
function rankedLinks(html: string, base: string): { url: string; score: number }[] {
  const host = new URL(base).hostname.replace(/^www\./, '');
  const out = new Map<string, number>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    if (SKIP.test(m[1])) continue;
    let u: URL;
    try { u = new URL(m[1], base); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== host) continue;
    u.hash = '';
    const text = plain(htmlToText(m[2]) + ' ' + decodeURIComponent(u.pathname));
    const score = LINK_SCORE.reduce((sum, [re, n]) => sum + (re.test(text) ? n : 0), 0);
    if (score > 0) out.set(u.href, Math.max(out.get(u.href) ?? 0, score));
  }
  return [...out].map(([url, score]) => ({ url, score })).sort((a, b) => b.score - a.score);
}

/** URLs listed in the site's sitemap (robots.txt tells where it is), ranked the same way – for menus built by script. */
async function sitemapLinks(base: string): Promise<{ url: string; score: number }[]> {
  const root = new URL('/', base).href;
  const robots = await get(new URL('/robots.txt', root).href, 4000).catch(() => null);
  const maps = [...(robots?.html.matchAll(/^sitemap:\s*(\S+)/gim) ?? [])].map((m) => m[1]).slice(0, 2);
  if (!maps.length) maps.push(new URL('/sitemap.xml', root).href);
  const urls: string[] = [];
  for (const m of maps) {
    const x = await getXml(m);
    if (!x) continue;
    const locs = [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((y) => y[1]);
    // A sitemap index: read its first few sitemaps
    if (/<sitemapindex/i.test(x)) { for (const sub of locs.slice(0, 3)) { const y = await getXml(sub); if (y) urls.push(...[...y.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((z) => z[1])); } }
    else urls.push(...locs);
  }
  return urls.filter((u) => !SKIP.test(u)).map((url) => ({ url, score: LINK_SCORE.reduce((sum, [re, n]) => sum + (re.test(plain(decodeURIComponent(url))) ? n : 0), 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
}
async function getXml(url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url, { headers: { 'user-agent': BROWSER_UA }, signal: AbortSignal.timeout(5000) });
    return res.ok ? (await res.text()).slice(0, 600_000) : null;
  } catch { return null; }
}

/** Does a page give the place? A postal address in its data, coordinates, or a line with a postcode and a town. */
const POSTCODE_LINE = /\b(\d{4,5}|\d{3}\s?\d{2}|[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2})\b[^\n]{2,60}[a-zà-ÿ]{3,}/i;
const placeIn = (html: string) => ({ address: !!schemaAddress(html), coords: !!(findCoords(html) ?? findCoords(htmlToText(html))),
  line: POSTCODE_LINE.test(htmlToText(html)) });

/** Reads the producer's site the way a person would: the home page, then the pages its own links (and sitemap) point
 *  to that are most likely to hold the address – contact, visit, about – one level further if needed. Stops when the
 *  address and the coordinates are found, or after maxPages. Guessed addresses (/contact …) only when the site has
 *  no such links at all (a menu built by script and no sitemap). */
async function crawlSite(home: { url: string; html: string }, country: string | null, maxPages = 10) {
  const seen = new Set<string>([home.url]);
  const pages: { url: string; html: string }[] = [];
  let queue = rankedLinks(home.html, home.url);
  if (!queue.length) queue = await sitemapLinks(home.url);
  if (!queue.length) queue = guessedContactPages(home.url, country).map((url) => ({ url, score: 1 }));
  let found = placeIn(home.html);
  while (queue.length && pages.length < maxPages && !(found.coords && (found.address || found.line))) {
    const batch = queue.filter((q) => !seen.has(q.url)).slice(0, 4);
    if (!batch.length) break;
    batch.forEach((q) => seen.add(q.url));
    const got = (await Promise.all(batch.map((q) => get(q.url, 5000)))).filter((p): p is { url: string; html: string } => !!p);
    for (const p of got) {
      if (pages.some((x) => x.html === p.html) || p.html === home.html) continue;
      pages.push(p);
      const f = placeIn(p.html);
      found = { address: found.address || f.address, coords: found.coords || f.coords, line: found.line || f.line };
      // One level further: the links on this page (e.g. "Contatti" under "Azienda")
      queue.push(...rankedLinks(p.html, p.url).map((l) => ({ ...l, score: l.score - 1 })));
    }
    queue = queue.filter((q) => !seen.has(q.url)).sort((a, b) => b.score - a.score);
  }
  return pages;
}
function guessedContactPages(base: string, country: string | null) {
  const own: Record<string, string[]> = {
    IT: ['contatti', 'azienda', 'chi-siamo'], ES: ['contacto', 'nosotros'], PT: ['contactos', 'contacto'],
    DE: ['kontakt', 'impressum'], AT: ['kontakt', 'impressum'], FR: ['contact', 'nous-contacter'],
  };
  return [...new Set([...(own[country ?? ''] ?? []), 'contact', 'contact-us', 'kontakt', 'contatti', 'contacto', 'about'])].map((p) => new URL('/' + p, base).href);
}
/** For the "is this the producer's site" check: the few pages most likely to say who and what. */
function contactLinks(html: string, base: string, country: string | null = null) {
  const real = rankedLinks(html, base).map((l) => l.url);
  return (real.length ? real : guessedContactPages(base, country)).slice(0, 4);
}

export const onRequestPost = async ({ request, env }: { request: Request; env: AiEnv }) => {
  if (!(await isHost(request))) return json({ error: 'not_host' }, 403);
  let body: { producer?: string; wine?: string; region?: string; appellation?: string; country?: string; website?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const given0 = cleanUrl(String(body.website ?? ''))?.href ?? null;
  // A website alone is enough (the host typed it); otherwise the producer's name is needed to look for one
  const producer = String(body.producer ?? '').trim() || (given0 ? new URL(given0).hostname.replace(/^www\./, '').split('.')[0] : '');
  if (!producer) return json({ error: 'no_producer' }, 400);
  const limited = await overDailyLimit(request, 'ai');
  if (limited) return limited;
  const country = String(body.country ?? '').toUpperCase() || null;
  const words = keyWords(producer);

  // 1. Candidates: a website the host gave, else the model's suggestions, then names turned into domains
  const given = cleanUrl(String(body.website ?? ''))?.href ?? null;
  let suggested: string[] = [];
  if (!given) try {
    const out = await meteredAi(env, request, 'producer').run(MODEL, {
      messages: [{ role: 'user', content: `What is the official website of this wine producer? Return ONLY JSON {"websites": [up to 3 full URLs, most likely first]} or {"websites": []} if you do not know.
Producer: ${producer}
Wine: ${body.wine ?? ''}
Appellation: ${body.appellation ?? ''}, region: ${body.region ?? ''}, country: ${country ?? ''}` }],
      max_tokens: 150, temperature: 0,
    });
    const a = parseAnswer(out.response);
    suggested = (Array.isArray(a?.websites) ? a!.websites : []).map(str).filter(Boolean) as string[];
  } catch {}
  const candidates = given ? [given] : [...new Set([...suggested, ...guessDomains(producer, country, String(body.region ?? ''))])].slice(0, 16);

  // 2. Every candidate checked at once; the best page that names the producer and is about wine wins
  const origin = [body.appellation, body.region].map((x) => plain(String(x ?? '')).replace(/[^a-z0-9]+/g, ' ').trim()).filter((x) => x.length > 3);
  const wineWords = plain(String(body.wine ?? '')).split(/[^a-z0-9]+/).filter((w) => w.length > 4 && !words.includes(w));
  const tried: { url: string; result: string }[] = [];
  const fetched = await Promise.all(candidates.map((u) => get(u)));
  let site = null as { url: string; html: string } | null;
  let best = -1;
  for (const [i, page] of fetched.entries()) {
    if (!page) { tried.push({ url: candidates[i], result: `unreachable (${failed.get(candidates[i]) ?? '?'})` }); continue; }
    if (given) { site = page; tried.push({ url: candidates[i], result: 'given' }); continue; }
    let { score, why } = scorePage(page, words, origin, wineWords);
    // The producer's own domain, but a home page with little to read (an age check, a picture): read its contact or
    // about page too before deciding – the domain alone is not enough (bollinger.com is not the Champagne house)
    if (score == null && why.includes('own domain') && why.includes('wine words 0')) {
      const links = contactLinks(page.html, page.url, country).slice(0, 4);
      const extra = (await Promise.all(links.map((u) => get(u, 6000)))).filter(Boolean) as { url: string; html: string }[];
      if (extra.length) ({ score, why } = scorePage({ url: page.url, html: page.html + extra.map((e) => e.html).join('') }, words, origin, wineWords));
      why += ` (with ${extra.length} of ${links.map((l) => new URL(l).pathname).join(' ')})`;
    }
    tried.push({ url: candidates[i], result: (score == null ? 'not the producer: ' : `score ${score}: `) + why });
    if (score != null && score > best) { best = score; site = page; }
  }
  if (!site) {
    console.log('find-producer', JSON.stringify({ producer, tried, suggested }).slice(0, 4000));
    return json({ producer, website: given, location: null, address: null });
  }

  // 3. The place: the home page, then the pages the site's own links lead to (contact, visit, about …)
  const pages = [site, ...(await crawlSite(site, country))];
  let location: { lat: number; lon: number; source: string; page: string } | null = null;
  for (const p of pages) {
    // In the page's code, or written in its text ("GPS: 44.61 7.96" with tags in between)
    const c = findCoords(p.html) ?? findCoords(htmlToText(p.html));
    if (c) { location = { lat: c.lat, lon: c.lon, source: c.how, page: p.url }; break; }
  }
  // The postal address: from the site's structured data, else as written on the site (read by the model)
  let address: string | null = pages.map((p) => schemaAddress(p.html)).find(Boolean) ?? null;
  let hints: string[] = [];
  if (!address) try {
    // Addresses sit in the header, the footer or the middle of a contact page: give the model the start and end of each page,
    // and first the lines that look like an address (a postcode and a town) and the place names in map links
    // Contact pages before the home page, so they are not cut off
    const texts = [...new Set([...pages.slice(1), pages[0]].map((p) => htmlToText(p.html)))];
    // A line with a postcode and a town, together with the two lines above it (name and street)
    const POSTCODE = /\b(\d{4,5}|\d{3}\s?\d{2}|[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2})\b/;
    hints = [...new Set([
      ...texts.flatMap((t) => {
        const lines = t.split(/\n|\s{3,}|\|/).map((l) => l.trim()).filter(Boolean);
        return lines.flatMap((l, i) => l.length > 6 && l.length < 160 && POSTCODE.test(l) && /[a-zà-ÿ]{3,}/i.test(l) && !/©|copyright/i.test(l)
          ? [lines.slice(Math.max(0, i - 2), i + 1).filter((x) => x.length < 120).join(', ')] : []);
      }),
      ...pages.flatMap((p) => mapPlaces(p.html)),
    ])].slice(0, 25);
    const text = (hints.length ? 'Lines that may be the address:\n' + hints.join('\n') + '\n\n' : '')
      + texts.map((t) => (t.length > 6000 ? t.slice(0, 2500) + '\n…\n' + t.slice(-3500) : t)).join('\n---\n').slice(0, 14000);
    const out = await meteredAi(env, request, 'producer-address').run(MODEL, {
      messages: [{ role: 'user', content: `Below is text from the website of the wine producer "${producer}". Return ONLY JSON {"address": the producer's own postal address as written on the site – street if given, postcode, town, country – or null if the site does not give one}. Many estates have no street: "Château X, 33250 Pauillac, France" is a full address. The address on the site's own contact page counts even when it is written under the name of the company that owns or sells the wine. Leave out company names and return the address only.\n\n${text}` }],
      max_tokens: 120, temperature: 0,
    });
    address = str(parseAnswer(out.response)?.address);
  } catch {}
  // No coordinates on the site: the exact place of the address (a building, house number or the estate – never just the town)
  if (!location && address) {
    const hit = await geocodeAddress(address, country);
    if (hit) location = { lat: hit.lat, lon: hit.lon, source: hit.source, page: '' };
  }
  // What the lookup saw (for checking why something was not found) goes to the function's log, not to the browser
  console.log('find-producer', JSON.stringify({ producer, tried, suggested, hints,
    pages_read: pages.map((p) => ({ url: p.url, chars: p.html.length })) }).slice(0, 4000));
  return json({ producer, website: new URL(site.url).origin + '/', location, address });
};
