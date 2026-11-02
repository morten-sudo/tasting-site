// Finds a wine producer's own website and, from it, where the producer is (hosts; the browser saves the result on the wine).
// 1. Candidate sites: Cloudflare AI's suggestions plus domains built from the producer's name.
// 2. A candidate counts only when the page itself names the producer.
// 3. The place: coordinates in the page's data, in an embedded map link, or the postal address as text.
import { MODEL, isHost, json, parseAnswer, str, type AiEnv } from '../../src/server/wine-ai';
import { cleanUrl, htmlToText } from './read-link';

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

/** Domains to try, built from the name: kopke.com, chateau-belgrave.com, belgrave.fr … */
function guessDomains(producer: string, country: string | null) {
  const full = plain(producer).replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  const core = plain(producer.replace(PREFIXES, '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  const stems = new Set([core.join(''), core.join('-'), full.join('-'), full.join('')].filter((s) => s.length > 2));
  const tlds = ['com', ...(TLDS[country ?? ''] ?? [])];
  return [...stems].flatMap((s) => tlds.map((t) => `https://www.${s}.${t}/`));
}

async function get(url: string, ms = 7000): Promise<{ url: string; html: string } | null> {
  const u = cleanUrl(url);
  if (!u) return null;
  try {
    const res = await fetch(u.href, { headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'en,fr;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
    const html = (await res.text()).slice(0, 1_500_000);
    return { url: res.url || u.href, html };
  } catch { return null; }
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
    [/google\.[a-z.]+\/maps[^"'\s<>]*@(-?\d+\.\d+),(-?\d+\.\d+)/i, 'map link'],
    [/maps[^"'\s<>]*[?&](?:q|ll|center|daddr|destination|query)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i, 'map link'],
    [/data-lat(?:itude)?=["'](-?\d+\.\d+)["'][^>]*data-(?:lng|lon|longitude)=["'](-?\d+\.\d+)/i, 'map data'],
    [/"lat"\s*:\s*(-?\d+\.\d{3,})\s*,\s*"(?:lng|lon)"\s*:\s*(-?\d+\.\d{3,})/i, 'map data'],
  ];
  for (const [re, how] of tries) {
    const m = html.match(re);
    const c = m && ok(m[1], m[2], how);
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

/** Pages likely to hold the address or a map: contact, visit, find us … */
function contactLinks(html: string, base: string) {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const text = plain(htmlToText(m[2]) + ' ' + m[1]);
    if (!/contact|kontakt|contato|contacto|contatti|visit|besuch|visite|acces|venir|trouver|find-us|find us|location|localiza|come-to|onde|where|map|plan/.test(text)) continue;
    try {
      const u = new URL(m[1], base);
      if (u.hostname === new URL(base).hostname) out.add(u.href);
    } catch {}
    if (out.size >= 3) break;
  }
  return [...out];
}

export const onRequestPost = async ({ request, env }: { request: Request; env: AiEnv }) => {
  if (!(await isHost(request))) return json({ error: 'not_host' }, 403);
  let body: { producer?: string; wine?: string; region?: string; appellation?: string; country?: string; website?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const producer = String(body.producer ?? '').trim();
  if (!producer) return json({ error: 'no_producer' }, 400);
  const country = String(body.country ?? '').toUpperCase() || null;
  const words = keyWords(producer);

  // 1. Candidates: a website the host gave, else the model's suggestions, then names turned into domains
  const given = cleanUrl(String(body.website ?? ''))?.href ?? null;
  let suggested: string[] = [];
  if (!given) try {
    const out = await env.AI.run(MODEL, {
      messages: [{ role: 'user', content: `What is the official website of this wine producer? Return ONLY JSON {"websites": [up to 3 full URLs, most likely first]} or {"websites": []} if you do not know.
Producer: ${producer}
Wine: ${body.wine ?? ''}
Appellation: ${body.appellation ?? ''}, region: ${body.region ?? ''}, country: ${country ?? ''}` }],
      max_tokens: 150, temperature: 0,
    });
    const a = parseAnswer(out.response);
    suggested = (Array.isArray(a?.websites) ? a!.websites : []).map(str).filter(Boolean) as string[];
  } catch {}
  const candidates = given ? [given] : [...new Set([...suggested, ...guessDomains(producer, country)])].slice(0, 12);

  // 2. The first candidate whose page names the producer
  const tried: { url: string; result: string }[] = [];
  let site: { url: string; html: string } | null = null;
  for (const url of candidates) {
    const page = await get(url);
    if (!page) { tried.push({ url, result: 'unreachable' }); continue; }
    const head = plain(htmlToText(page.html.slice(0, 200_000)).slice(0, 20_000) + ' ' + page.url);
    const hits = words.filter((w) => head.includes(w)).length;
    if (given || (words.length && hits >= Math.min(words.length, 2))) { site = page; tried.push({ url, result: 'match' }); break; }
    tried.push({ url, result: 'does not name the producer' });
  }
  if (!site) return json({ producer, website: given, location: null, address: null, tried, suggested });

  // 3. The place: home page first, then contact/visit pages
  const pages = [site, ...(await Promise.all(contactLinks(site.html, site.url).map((u) => get(u))))].filter(Boolean) as { url: string; html: string }[];
  let location: { lat: number; lon: number; source: string; page: string } | null = null;
  for (const p of pages) {
    const c = findCoords(p.html);
    if (c) { location = { lat: c.lat, lon: c.lon, source: c.how, page: p.url }; break; }
  }
  // The postal address: from the site's structured data, else as written on the site (read by the model)
  let address: string | null = pages.map((p) => schemaAddress(p.html)).find(Boolean) ?? null;
  if (!address) try {
    // Addresses sit in the header, the footer or the middle of a contact page: give the model the start and end of each page,
    // and first the lines that look like an address (a postcode and a town) and the place names in map links
    const texts = pages.map((p) => htmlToText(p.html));
    const hints = [...new Set([
      ...texts.flatMap((t) => t.split(/\n|\s{3,}|\|/).map((l) => l.trim())
        .filter((l) => l.length > 6 && l.length < 160 && /\b(\d{4,5}|\d{3}\s?\d{2}|[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2})\b/.test(l) && /[a-zà-ÿ]{3,}/i.test(l))),
      ...pages.flatMap((p) => mapPlaces(p.html)),
    ])].slice(0, 25);
    const text = (hints.length ? 'Lines that may be the address:\n' + hints.join('\n') + '\n\n' : '')
      + texts.map((t) => (t.length > 6000 ? t.slice(0, 2500) + '\n…\n' + t.slice(-3500) : t)).join('\n---\n').slice(0, 14000);
    const out = await env.AI.run(MODEL, {
      messages: [{ role: 'user', content: `Below is text from the website of the wine producer "${producer}". Return ONLY JSON {"address": the producer's own postal address as written on the site – street if given, postcode, town, country – or null if the site does not give one}. Many estates have no street: "Château X, 33250 Pauillac, France" is a full address.\n\n${text}` }],
      max_tokens: 120, temperature: 0,
    });
    address = str(parseAnswer(out.response)?.address);
  } catch {}
  return json({ producer, website: new URL(site.url).origin + '/', location, address, tried, suggested });
};
