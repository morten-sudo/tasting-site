// Overview maps: every wine on a map, also where there is no detailed region map.
// A wine is placed at its appellation (fixed coordinates on the appellation list), at a place
// Cloudflare AI found for an appellation not on the list (checked against the country), in the
// middle of its region (wine_regions) or in the middle of its country. Land and borders come from Natural Earth (scripts/build-overview.py).
import { supabase } from './supabase';
import { loadAppellations, loadRegions, matchRegion, normOrigin, countryName } from './origin';

export type OverviewMap = { id: string; w: number; h: number; proj: { lon0: number; lat1: number; k: number; s: number }; land: string; border: string };
type Country = { box: [number, number, number, number]; centre: [number, number] };
type Guess = { key: string; name: string; country: string; lat: number; lon: number };
export type Place = { lon: number; lat: number; how: 'producer' | 'appellation' | 'guess' | 'regionCentre' | 'country'; label: string; country: string | null };

const once = <T,>(f: () => Promise<T>) => { let p: Promise<T> | null = null; return () => (p ??= f()); };
const getJson = <T,>(url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
const overviews = new Map<string, Promise<OverviewMap | null>>();
export const loadOverview = (id: 'europe' | 'world') => {
  if (!overviews.has(id)) overviews.set(id, getJson<OverviewMap>(`/maps/${id}.json`));
  return overviews.get(id)!;
};
// ---------- Detailed tiles (scripts/build-detail-tiles.py) for a map zoomed in on a small area ----------
type Tile = { land: number[][]; lakes: number[][]; rivers: number[][]; coast: number[][]; border: number[][] };
/** Shapes in longitude/latitude, per layer; land as one list per tile (drawn tile by tile, so overlaps show no seams). */
export type Detail = { land: [number, number][][][]; lakes: [number, number][][]; rivers: [number, number][][]; coast: [number, number][][]; border: [number, number][][] };
const tileIndex = once(() => getJson<{ size: number; tiles: [number, number][] }>('/maps/tiles/index.json'));
const tiles = new Map<string, Promise<Tile | null>>();
const decode = (flat: number[]) => {
  const out: [number, number][] = [];
  let x = 0, y = 0;
  for (let i = 0; i < flat.length; i += 2) {
    x = i ? x + flat[i] : flat[i]; y = i ? y + flat[i + 1] : flat[i + 1];
    out.push([x / 1000, y / 1000]);
  }
  return out;
};
/** The detailed land, coast, lakes, rivers and borders of an area, or null outside the tiles. */
export async function loadDetail(area: Box): Promise<Detail | null> {
  const index = await tileIndex();
  if (!index) return null;
  const { size } = index;
  const have = new Set(index.tiles.map(([x, y]) => `${x}_${y}`));
  const keys: string[] = [];
  for (let x = Math.floor(area.lon0 / size) * size; x < area.lon1; x += size)
    for (let y = Math.floor(area.lat0 / size) * size; y < area.lat1; y += size)
      if (have.has(`${x}_${y}`)) keys.push(`${x}_${y}`);
  if (!keys.length || keys.length > 16) return null;
  const got = (await Promise.all(keys.map((k) => {
    if (!tiles.has(k)) tiles.set(k, getJson<Tile>(`/maps/tiles/${k}.json`));
    return tiles.get(k)!;
  }))).filter(Boolean) as Tile[];
  if (!got.length) return null;
  return {
    land: got.map((t) => t.land.map(decode)),
    lakes: got.flatMap((t) => t.lakes.map(decode)),
    rivers: got.flatMap((t) => t.rivers.map(decode)),
    coast: got.flatMap((t) => t.coast.map(decode)),
    border: got.flatMap((t) => t.border.map(decode)),
  };
}

export const loadCountries = once(async () => (await getJson<Record<string, Country>>('/maps/countries.json')) ?? {});
let guesses: Promise<Map<string, Guess>> | null = null;
export const loadGuesses = () => (guesses ??= (async () => {
  const { data } = await supabase.from('appellation_guesses').select('key, name, country, lat, lon');
  return new Map(((data ?? []) as Guess[]).map((g) => [g.key, g]));
})());
/** After a new place has been saved: read the places again next time. */
export const forgetGuesses = () => { guesses = null; };

type OriginWine = { appellation?: string | null; appellation_id?: string | null; region?: string | null; country?: string | null;
  producer?: string | null; producer_lat?: number | null; producer_lon?: number | null };

/** Where a wine goes on an overview map, or null when not even the country is known. */
export async function placeOf(w: OriginWine): Promise<Place | null> {
  const [apps, guesses, countries, regions] = await Promise.all([loadAppellations(), loadGuesses(), loadCountries(), loadRegions()]);
  // The producer's own place (from its website) is the most exact
  if (w.producer_lat != null && w.producer_lon != null) {
    return { lon: w.producer_lon, lat: w.producer_lat, how: 'producer', label: w.producer || w.appellation || '', country: w.country ?? null };
  }
  const a = w.appellation_id ? apps.find((x) => x.id === w.appellation_id) : null;
  if (a?.lat != null && a?.lon != null) return { lon: a.lon, lat: a.lat, how: 'appellation', label: a.name, country: a.country };
  if (w.appellation && w.country) {
    const g = guesses.get(`${normOrigin(w.appellation)}|${w.country}`);
    if (g) return { lon: g.lon, lat: g.lat, how: 'guess', label: g.name, country: g.country };
  }
  const r = w.country ? matchRegion(regions, w.region, w.country) : null;
  if (r?.lat != null && r?.lon != null) return { lon: r.lon, lat: r.lat, how: 'regionCentre', label: r.name, country: r.country };
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
export function drawOverview(map: OverviewMap, pins: Pin[], focus: Box, mode: 'full' | 'mini' | 'inset' = 'full', detail: Detail | null = null): string {
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
    `<rect class="rm-sea" x="${x0}" y="${y0}" width="${w}" height="${h}"/>`];
  const dash = `stroke-width:${(u * 0.18).toFixed(2)};stroke-dasharray:${(u * 1.2).toFixed(1)} ${(u * 0.6).toFixed(1)}`;
  if (detail) {
    // Zoomed in: Natural Earth's detailed shapes, projected the same way as the overview
    const d = (shape: [number, number][], close: boolean) => 'M' + shape.map(([lon, lat]) => xy(lon, lat).map((v) => v.toFixed(2)).join(' ')).join('L') + (close ? 'Z' : '');
    for (const tile of detail.land) parts.push(`<path class="rm-land" fill-rule="evenodd" d="${tile.map((r) => d(r, true)).join('')}"/>`);
    if (detail.lakes.length) parts.push(`<path class="rm-sea" fill-rule="evenodd" d="${detail.lakes.map((r) => d(r, true)).join('')}"/>`);
    if (detail.rivers.length) parts.push(`<path class="rm-river" d="${detail.rivers.map((r) => d(r, false)).join('')}" style="stroke-width:${(u * 0.22).toFixed(2)};opacity:.55"/>`);
    if (detail.coast.length) parts.push(`<path class="rm-coast" d="${detail.coast.map((r) => d(r, false)).join('')}" style="stroke:#c9b9a8;stroke-width:${(u * 0.16).toFixed(2)}"/>`);
    if (detail.border.length) parts.push(`<path class="rm-border" d="${detail.border.map((r) => d(r, false)).join('')}" style="${dash}"/>`);
  } else {
    parts.push(`<path class="rm-land" d="${map.land}" style="stroke:#c9b9a8;stroke-width:${(u * 0.12).toFixed(2)}"/>`,
      `<path class="rm-border" d="${map.border}" style="${dash}"/>`);
  }
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
