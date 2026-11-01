// Overview maps: every wine on a map, also where there is no detailed region map.
// A wine is placed at its appellation (fixed coordinates on the appellation list), at a place
// Cloudflare AI found for an appellation not on the list (checked against the country), or in the
// middle of its country. Land and borders come from Natural Earth (scripts/build-overview.py).
import { supabase } from './supabase';
import { loadAppellations, normOrigin, countryName } from './origin';

export type OverviewMap = { id: string; w: number; h: number; proj: { lon0: number; lat1: number; k: number; s: number }; land: string; border: string };
type Country = { box: [number, number, number, number]; centre: [number, number] };
type Guess = { key: string; name: string; country: string; lat: number; lon: number };
export type Place = { lon: number; lat: number; how: 'appellation' | 'guess' | 'country'; label: string; country: string | null };

const once = <T,>(f: () => Promise<T>) => { let p: Promise<T> | null = null; return () => (p ??= f()); };
const getJson = <T,>(url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
const overviews = new Map<string, Promise<OverviewMap | null>>();
export const loadOverview = (id: 'europe' | 'world') => {
  if (!overviews.has(id)) overviews.set(id, getJson<OverviewMap>(`/maps/${id}.json`));
  return overviews.get(id)!;
};
export const loadCountries = once(async () => (await getJson<Record<string, Country>>('/maps/countries.json')) ?? {});
let guesses: Promise<Map<string, Guess>> | null = null;
export const loadGuesses = () => (guesses ??= (async () => {
  const { data } = await supabase.from('appellation_guesses').select('key, name, country, lat, lon');
  return new Map(((data ?? []) as Guess[]).map((g) => [g.key, g]));
})());
/** After a new place has been saved: read the places again next time. */
export const forgetGuesses = () => { guesses = null; };

type OriginWine = { appellation?: string | null; appellation_id?: string | null; region?: string | null; country?: string | null };

/** Where a wine goes on an overview map, or null when not even the country is known. */
export async function placeOf(w: OriginWine): Promise<Place | null> {
  const [apps, guesses, countries] = await Promise.all([loadAppellations(), loadGuesses(), loadCountries()]);
  const a = w.appellation_id ? apps.find((x) => x.id === w.appellation_id) : null;
  if (a?.lat != null && a?.lon != null) return { lon: a.lon, lat: a.lat, how: 'appellation', label: a.name, country: a.country };
  if (w.appellation && w.country) {
    const g = guesses.get(`${normOrigin(w.appellation)}|${w.country}`);
    if (g) return { lon: g.lon, lat: g.lat, how: 'guess', label: g.name, country: g.country };
  }
  const c = w.country ? countries[w.country] : null;
  if (c) return { lon: c.centre[0], lat: c.centre[1], how: 'country', label: w.region || countryName(w.country) || w.country!, country: w.country! };
  return null;
}

const EUROPE = { lon0: -11, lat0: 34.5, lon1: 32, lat1: 60.5 };
const inEurope = (p: { lon: number; lat: number }) => p.lon > EUROPE.lon0 && p.lon < EUROPE.lon1 && p.lat > EUROPE.lat0 && p.lat < EUROPE.lat1;
export const overviewFor = (places: Place[]) => (places.every(inEurope) ? 'europe' : 'world') as 'europe' | 'world';

type Box = { lon0: number; lat0: number; lon1: number; lat1: number };

/** The area to show: the countries of the places (or, for one exact place, the land around it). */
export async function focusFor(places: Place[], close = false): Promise<Box> {
  if (close && places.length && places.every((p) => p.how !== 'country')) {
    const lon = places.map((p) => p.lon), lat = places.map((p) => p.lat);
    const cx = (Math.min(...lon) + Math.max(...lon)) / 2, cy = (Math.min(...lat) + Math.max(...lat)) / 2;
    const dx = Math.max(2.6, (Math.max(...lon) - Math.min(...lon)) * 0.8), dy = Math.max(1.7, (Math.max(...lat) - Math.min(...lat)) * 0.8);
    return { lon0: cx - dx, lat0: cy - dy, lon1: cx + dx, lat1: cy + dy };
  }
  const countries = await loadCountries();
  const boxes = [...new Set(places.map((p) => p.country).filter(Boolean))].map((c) => countries[c!]?.box).filter(Boolean) as Country['box'][];
  if (!boxes.length) return { lon0: -10, lat0: 36, lon1: 20, lat1: 55 };
  return { lon0: Math.min(...boxes.map((b) => b[0])), lat0: Math.min(...boxes.map((b) => b[1])), lon1: Math.max(...boxes.map((b) => b[2])), lat1: Math.max(...boxes.map((b) => b[3])) };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export type Pin = { lon: number; lat: number; label?: string; n?: number };

/** The overview map, cut to `focus`, with a pin (and label or number) for each place. */
export function drawOverview(map: OverviewMap, pins: Pin[], focus: Box, mode: 'full' | 'mini' | 'inset' = 'full'): string {
  const { lon0, lat1, k, s } = map.proj;
  const xy = (lon: number, lat: number) => [(lon - lon0) * k * s, (lat1 - lat) * s];
  let [x0, y0] = xy(focus.lon0, focus.lat1);
  let [x1, y1] = xy(focus.lon1, focus.lat0);
  // A little room around, and the shape of the box kept sensible
  const pad = Math.max(x1 - x0, y1 - y0) * 0.08;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const want = mode === 'inset' ? 1.15 : 1.45;
  let w = x1 - x0, h = y1 - y0;
  if (w / h < want) { const nw = h * want; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / want; y0 -= (nh - h) / 2; h = nh; }
  const u = w / 100; // one unit ≈ 1 % of the width, so pins and text keep their size at any zoom
  const parts = [`<svg class="region-map overview ${mode}" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" xmlns="http://www.w3.org/2000/svg" role="img">`,
    `<rect class="rm-sea" x="${x0}" y="${y0}" width="${w}" height="${h}"/>`,
    `<path class="rm-land" d="${map.land}" style="stroke:#c9b9a8;stroke-width:${(u * 0.12).toFixed(2)}"/>`,
    `<path class="rm-border" d="${map.border}" style="stroke-width:${(u * 0.18).toFixed(2)};stroke-dasharray:${(u * 1.2).toFixed(1)} ${(u * 0.6).toFixed(1)}"/>`];
  for (const p of pins) {
    const [x, y] = xy(p.lon, p.lat);
    const r = mode === 'inset' ? u * 3.2 : u * 1.6;
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 2.6).toFixed(1)}" fill="#6e0f1f" fill-opacity=".14"/>`);
    if (p.n) {
      const rr = u * 2.6;
      parts.push(`<g class="rm-badge"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" style="stroke-width:${(u * 0.4).toFixed(2)}"/><text class="rm-badge-n" x="${x.toFixed(1)}" y="${(y + u * 1.1).toFixed(1)}" style="font-size:${(u * 3).toFixed(1)}px">${p.n}</text></g>`);
    } else {
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#6e0f1f" stroke="#fff" stroke-width="${(u * 0.5).toFixed(2)}"/>`);
    }
    if (p.label && mode !== 'inset') {
      const fs = u * (mode === 'mini' ? 5.2 : 3.4);
      parts.push(`<text class="rm-badge-title" x="${(x + u * 3.4).toFixed(1)}" y="${(y - u * 1.2).toFixed(1)}" style="font-size:${fs.toFixed(1)}px;stroke-width:${(fs * 0.25).toFixed(1)}px">${esc(p.label)}</text>`);
    }
  }
  parts.push('</svg>');
  return parts.join('');
}
