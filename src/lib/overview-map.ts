// Overview maps: every wine on a map, also where there is no detailed region map.
// A wine is placed at its appellation (fixed coordinates on the appellation list), at a place
// Cloudflare AI found for an appellation not on the list (checked against the country), in the
// middle of its region (wine_regions) or in the middle of its country. Land and borders come from Natural Earth (scripts/build-overview.py).
import { supabase } from './supabase';
import { esc } from './ui/dom';
import { anchored } from './region-map';
import { loadAppellations, loadRegions, matchRegion, normOrigin, countryName } from './origin';
import { lang } from '../i18n';

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
// ---------- Towns: Natural Earth's populated places (public/maps/places.json: [lon, lat, name, scalerank, capital,
// names?]), the bigger first – drawn as on the detailed region maps (a dot and a name with a light halo). The optional
// sixth item holds the names that differ per language ({ da: 'Wien', is: 'Vín' }, scripts/town-names.py); without
// one the English name is used. The app reads the same file from the live site: only add items, never change them. ----------
export type Town = [number, number, string, number, number, Partial<Record<string, string>>?];
export const loadTowns = once(() => getJson<Town[]>('/maps/places.json'));
/** A town's name in the site's language, else its English name. */
export const townName = (town: Town, l: string = lang()) => town[5]?.[l] ?? town[5]?.en ?? town[2];

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
/** The detailed tiles for a map of `focus` when it is a small area (a few countries at most), with room around; else null. */
export async function detailFor(focus: Box): Promise<Detail | null> {
  const small = focus.lon1 - focus.lon0 < 20 && focus.lat1 - focus.lat0 < 14;
  if (!small) return null;
  const margin = Math.max(focus.lon1 - focus.lon0, focus.lat1 - focus.lat0) * 0.35;
  return loadDetail({ lon0: focus.lon0 - margin, lat0: focus.lat0 - margin, lon1: focus.lon1 + margin, lat1: focus.lat1 + margin });
}

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
  // The places themselves too: a country's box is its mainland, so an island (Madeira, the Canaries) would be outside
  for (const p of places) if (p.how !== 'country') boxes.push([p.lon - 0.5, p.lat - 0.5, p.lon + 0.5, p.lat + 0.5]);
  if (!boxes.length) return { lon0: -10, lat0: 36, lon1: 20, lat1: 55 };
  return { lon0: Math.min(...boxes.map((b) => b[0])), lat0: Math.min(...boxes.map((b) => b[1])), lon1: Math.max(...boxes.map((b) => b[2])), lat1: Math.max(...boxes.map((b) => b[3])) };
}


export type Pin = { lon: number; lat: number; label?: string; n?: number };

/** Places that would lie on top of each other on the map (closer than a numbered pin is wide, at the view drawOverview()
 *  gives `focus`) as one pin: the wines added up, named after the region they share (else the place with the most
 *  wines), at their middle. The places with the most wines first. */
export function clusterPins<P extends { lon: number; lat: number; n: number; label: string; region?: string | null }>(map: OverviewMap, places: P[], focus: Box): Pin[] {
  const { lon0, lat1, k, s } = map.proj;
  const xy = (lon: number, lat: number) => [(lon - lon0) * k * s, (lat1 - lat) * s];
  const [ax, ay] = xy(focus.lon0, focus.lat1), [bx, by] = xy(focus.lon1, focus.lat0);
  const pad = Math.max(bx - ax, by - ay) * 0.08;
  const w0 = bx - ax + 2 * pad, h0 = by - ay + 2 * pad;
  const u = Math.max(w0, h0 * 1.45) / 100;
  type C = { items: P[]; x: number; y: number };
  const out: C[] = [];
  for (const p of [...places].sort((a, b) => b.n - a.n)) {
    const [x, y] = xy(p.lon, p.lat);
    const c = out.find((o) => Math.hypot(o.x - x, o.y - y) < u * 5.6);
    if (c) {
      c.items.push(p);
      const n = c.items.reduce((t, i) => t + i.n, 0);
      c.x += (x - c.x) * p.n / n; c.y += (y - c.y) * p.n / n;
    } else out.push({ items: [p], x, y });
  }
  return out.map((c) => {
    const n = c.items.reduce((t, i) => t + i.n, 0);
    const lon = c.items.reduce((t, i) => t + i.lon * i.n, 0) / n, lat = c.items.reduce((t, i) => t + i.lat * i.n, 0) / n;
    const regions = new Set(c.items.map((i) => normOrigin(i.region)));
    const label = c.items.length > 1 && regions.size === 1 && c.items[0].region?.trim() ? c.items[0].region.trim() : c.items[0].label;
    return { lon, lat, n, label };
  });
}

/** The overview map, cut to `focus`, with a pin (and label or number) for each place. */
export function drawOverview(map: OverviewMap, pins: Pin[], focus: Box, mode: 'full' | 'inset' = 'full', detail: Detail | null = null, towns: Town[] | null = null): string {
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
  // Line widths follow the zoom (map-zoom.ts sets --z), so they keep their width on screen
  const zw = (v: number) => `calc(var(--z, 1) * ${v.toFixed(2)}px)`;
  const dash = `stroke-width:${zw(u * 0.18)};stroke-dasharray:${zw(u * 1.2)} ${zw(u * 0.6)}`;
  if (detail) {
    // Zoomed in: Natural Earth's detailed shapes, projected the same way as the overview
    const d = (shape: [number, number][], close: boolean) => 'M' + shape.map(([lon, lat]) => xy(lon, lat).map((v) => v.toFixed(2)).join(' ')).join('L') + (close ? 'Z' : '');
    for (const tile of detail.land) parts.push(`<path class="rm-land" fill-rule="evenodd" d="${tile.map((r) => d(r, true)).join('')}"/>`);
    if (detail.lakes.length) parts.push(`<path class="rm-sea" fill-rule="evenodd" d="${detail.lakes.map((r) => d(r, true)).join('')}"/>`);
    if (detail.rivers.length) parts.push(`<path class="rm-river" d="${detail.rivers.map((r) => d(r, false)).join('')}" style="stroke-width:${zw(u * 0.22)};opacity:.55"/>`);
    if (detail.coast.length) parts.push(`<path class="rm-coast" d="${detail.coast.map((r) => d(r, false)).join('')}" style="stroke:#c9b9a8;stroke-width:${zw(u * 0.16)}"/>`);
    if (detail.border.length) parts.push(`<path class="rm-border" d="${detail.border.map((r) => d(r, false)).join('')}" style="${dash}"/>`);
  } else {
    parts.push(`<path class="rm-land" d="${map.land}" style="stroke:#c9b9a8;stroke-width:${zw(u * 0.12)}"/>`,
      `<path class="rm-border" d="${map.border}" style="${dash}"/>`);
  }
  // Pins, dots and names are drawn at a fixed scale (one unit of the map's width = 10) and scaled down: on a map of a
  // large area the sizes would be fractions of a pixel, and browsers space such tiny letters unevenly
  const q = (v: number) => (v * 10 / u).toFixed(1);
  const sc = (inner: string) => `<g transform="scale(${(u / 10).toPrecision(4)})">${inner}</g>`;
  type Rect = [number, number, number, number];
  const meets = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const inside = (b: Rect, m = u * 0.8) => b[0] >= x0 + m && b[2] <= x0 + w - m && b[1] >= y0 + m && b[3] <= y0 + h - m;
  // The zoom buttons (+ and −) lie on the map's top right corner: no names there (measured on a phone)
  const buttons: Rect = [x0 + w - u * 12.5, y0, x0 + w, y0 + u * 23.5];
  const at = pins.map((p) => xy(p.lon, p.lat));
  const marks: Rect[] = pins.map((p, i) => { const [x, y] = at[i]; const r = p.n ? u * 2.8 : u * 1.9; return [x - r, y - r, x + r, y + r]; });
  const names: Rect[] = [];
  const townSvg: string[] = [];
  // Towns for orientation: the biggest in the area the map is about first, then the rest of the view. The name goes
  // right of the dot, else left, above or below – never on a pin, a pin's name, the zoom buttons or another town.
  // All names have one size (3.4 % of the map's width, as the pins' names); a town without room is left out
  const fs = u * 3.4;
  const about = (lon: number, lat: number) => lon >= focus.lon0 && lon <= focus.lon1 && lat >= focus.lat0 && lat <= focus.lat1;
  const inView = towns && mode === 'full' ? towns.filter(([lon, lat]) => { const [x, y] = xy(lon, lat); return x > x0 + u * 1.5 && x < x0 + w - u * 1.5 && y > y0 + u * 1.5 && y < y0 + h - u * 1.5; }) : [];
  // Within the same size, a capital first, then the town nearest the wines
  const near = (lon: number, lat: number) => { const [x, y] = xy(lon, lat); return Math.min(...at.map(([px, py]) => Math.hypot(px - x, py - y)), Infinity); };
  const order = inView.map((t, i) => ({ t, i, a: about(t[0], t[1]) ? 0 : 1, d: near(t[0], t[1]) }))
    .sort((p, o) => p.a - o.a || p.t[3] - o.t[3] || o.t[4] - p.t[4] || p.d - o.d || p.i - o.i).map((o) => o.t);
  /** Draws the town when its name finds a free spot; `onPin`: its dot may lie under a pin (the main town). */
  const placeTown = (town: Town, onPin = false) => {
    const [lon, lat, , , cap] = town;
    const name = townName(town);
    const [x, y] = xy(lon, lat);
    const r = u * (cap ? 0.95 : 0.75);
    const dot: Rect = [x - r * 1.6, y - r * 1.6, x + r * 1.6, y + r * 1.6];
    if (meets(dot, buttons) || names.some((t) => meets(dot, t)) || (!onPin && marks.some((t) => meets(dot, t)))) return false;
    const tw = name.length * fs * (cap ? 0.58 : 0.57);
    const base = y - u * 1.1, top = base - fs * 0.86, bottom = base + fs * 0.28;
    // Each spot: the name's box, where the text starts and its anchor (the dot is checked above)
    const spots: [Rect, number, number, string][] = [
      [[x - tw, y + u * 1.4, x, y + u * 1.6 + fs], 0, y + u * 1.6 + fs * 0.74, ' text-anchor="end"'],
      [[x, y + u * 1.4, x + tw, y + u * 1.6 + fs], 0, y + u * 1.6 + fs * 0.74, ''],
      [[x - tw, y - u * 1.6 - fs, x, y - u * 1.4], 0, y - u * 1.6 - fs * 0.22, ' text-anchor="end"'],
      [[x, y - u * 1.6 - fs, x + tw, y - u * 1.4], 0, y - u * 1.6 - fs * 0.22, ''],
    ];
    // Right, left, above and below the dot first; for the main town among pins also a little further out
    for (const d of onPin ? [6, 3, 0] : [0]) spots.unshift(
      [[x + u * (1.1 + d), top, x + u * (1.3 + d) + tw, bottom], u * (1.3 + d), base, ''],
      [[x - u * (1.3 + d) - tw, top, x - u * (1.1 + d), bottom], -u * (1.3 + d), base, ' text-anchor="end"'],
      [[x - tw / 2, y - u * (1.6 + d) - fs * 1.08, x + tw / 2, y - u * (1.4 + d)], 0, y - u * (1.6 + d) - fs * 0.22, ' text-anchor="middle"'],
      [[x - tw / 2, y + u * (1.4 + d), x + tw / 2, y + u * (1.6 + d) + fs * 1.08], 0, y + u * (1.6 + d) + fs * 0.74, ' text-anchor="middle"'],
    );
    const spot = spots.find(([b]) => inside(b) && !meets(b, buttons) && ![...names, ...marks].some((t) => meets(b, t)));
    if (!spot) return false;
    const [box, tx, ty, anchor] = spot;
    names.push(box, dot);
    townSvg.push(anchored(x, y, sc(`<circle r="${q(r)}"/><text x="${q(tx)}" y="${q(ty - y)}"${anchor} style="font-size:${q(fs)}px;stroke-width:${q(fs * 0.24)}px">${esc(name)}</text>`), `rm-town${cap ? ' big' : ''}`));
    return true;
  };
  // The main town (the capital or the biggest town of the area) always comes first, even before the pins' names
  const main = order.find((town) => placeTown(town, true));
  // The pins' names: the places with the most wines first, to the right of the pin or else to the left – never on
  // another pin or name, nor outside the map (the number stays; the legend and the list name every wine)
  const pfs = u * 3.4;
  const side = new Map<number, 'right' | 'left'>();
  if (mode === 'full') {
    const byWines = pins.map((_, i) => i).sort((a, b) => (pins[b].n ?? 1) - (pins[a].n ?? 1));
    for (const i of byWines) {
      const label = pins[i].label;
      if (!label) continue;
      const [x, y] = at[i];
      const tw = label.length * pfs * 0.6, top = y - u * 1.2 - pfs * 0.86, bottom = y - u * 1.2 + pfs * 0.28;
      const free = (b: Rect) => inside(b, u * 0.4) && !meets(b, buttons) && !names.some((t) => meets(b, t)) && !marks.some((m, j) => j !== i && meets(b, m));
      const right: Rect = [x + u * 3.1, top, x + u * 3.4 + tw, bottom], left: Rect = [x - u * 3.4 - tw, top, x - u * 3.1, bottom];
      const s = free(right) ? 'right' : free(left) ? 'left' : null;
      if (!s) continue;
      side.set(i, s);
      names.push(s === 'right' ? right : left);
    }
  }
  // Then the other towns, at most seven in all
  let n = main ? 1 : 0;
  for (const town of order) {
    if (n >= 7) break;
    if (town !== main && placeTown(town)) n++;
  }
  parts.push(...townSvg);
  for (const [i, p] of pins.entries()) {
    const [x, y] = at[i];
    const r = mode === 'inset' ? u * 3.2 : u * 1.6;
    // Drawn around 0 0 at the place (anchored): the zoom keeps pins, numbers and names their size on screen
    // A pin whose name has no room on the map gets it as a tip (hover)
    const m: string[] = [p.label && mode === 'full' && !side.has(i) ? `<title>${esc(p.label)}</title>` : '', `<circle r="${q(r * 2.6)}" fill="#6e0f1f" fill-opacity=".14"/>`];
    if (p.n) {
      const rr = u * 2.6;
      m.push(`<g class="rm-badge"><circle r="${q(rr)}" style="stroke-width:${q(u * 0.4)}"/><text class="rm-badge-n" y="${q(u * 1.1)}" style="font-size:${q(u * 3)}px">${p.n}</text></g>`);
    } else {
      m.push(`<circle r="${q(r)}" fill="#6e0f1f" stroke="#fff" stroke-width="${q(u * 0.5)}"/>`);
    }
    const s = side.get(i);
    if (p.label && s) {
      m.push(`<text class="rm-badge-title" x="${q(s === 'left' ? -pfs : pfs)}" y="${q(-u * 1.2)}"${s === 'left' ? ' text-anchor="end"' : ''} style="font-size:${q(pfs)}px;stroke-width:${q(pfs * 0.25)}px">${esc(p.label)}</text>`);
    }
    parts.push(anchored(x, y, sc(m.join(''))));
  }
  parts.push('</svg>');
  return parts.join('');
}
