// Region maps for tastings: the wine region in an old atlas style, with the appellations of the
// tasting's wines filled in. The map data (public/maps/<region>.json) is built from open geodata
// by scripts/build-maps.py.
import { normOrigin, loadAppellations, type Appellation } from './origin';

export type RegionMap = {
  id: string; name: string; w: number; h: number;
  land: string; coast: string; border: string;
  rivers: { name: string; d: string }[];
  areas: Record<string, { d: string; label: [number, number]; title?: string }>;
  whole: string[];
  towns: { name: string; x: number; y: number; size: 'big' | 'mid' | 'small' }[];
  sources: string;
  /** x = (lon - lon0) * k * s, y = (lat1 - lat) * s */
  proj?: { lon0: number; lat1: number; k: number; s: number };
};

/** A place on the map (SVG coordinates), or null when outside it or the map has no projection. */
export function mapPoint(map: RegionMap, lon: number, lat: number): [number, number] | null {
  if (!map.proj) return null;
  const x = (lon - map.proj.lon0) * map.proj.k * map.proj.s, y = (map.proj.lat1 - lat) * map.proj.s;
  return x >= 0 && x <= map.w && y >= 0 && y <= map.h ? [x, y] : null;
}

/** A map pin whose tip is at (x, y). */
export const pinSvg = (x: number, y: number, title = '', scale = 1) =>
  `<g class="rm-pin" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale})">${title ? `<title>${esc(title)}</title>` : ''}<path d="M0 0 C-3 -9 -11 -13 -11 -22 A11 11 0 1 1 11 -22 C11 -13 3 -9 0 0 Z"/><circle cy="-22" r="4"/></g>`;

// Regions that have a map, by the region name stored on wines
const MAPS: Record<string, string> = { bordeaux: 'bordeaux', douro: 'douro', bourgogne: 'bourgogne', burgundy: 'bourgogne', champagne: 'champagne', roussillon: 'roussillon',
  // Keys are matched after normOrigin (lower case, no accents): 'Rhône', 'Vallée du Rhône' → 'rhone', 'vallee du rhone'
  rhone: 'rhone', 'rhone valley': 'rhone', 'vallee du rhone': 'rhone', toscana: 'toscana', tuscany: 'toscana',
  piemonte: 'piemonte', piedmont: 'piemonte', rioja: 'rioja', 'la rioja': 'rioja',
  // Not 'moselle': that is also the French department and AOC Moselle
  mosel: 'mosel', 'mosel saar ruwer': 'mosel' };

/** The detailed maps there are, with the region's name and country – for the superadmin's overview. */
export const DETAILED_MAPS: { id: string; name: string; country: string }[] = [
  { id: 'bordeaux', name: 'Bordeaux', country: 'FR' }, { id: 'bourgogne', name: 'Bourgogne', country: 'FR' },
  { id: 'champagne', name: 'Champagne', country: 'FR' }, { id: 'rhone', name: 'Rhône', country: 'FR' },
  { id: 'roussillon', name: 'Roussillon', country: 'FR' }, { id: 'toscana', name: 'Toscana', country: 'IT' },
  { id: 'piemonte', name: 'Piemonte', country: 'IT' }, { id: 'rioja', name: 'Rioja', country: 'ES' },
  { id: 'douro', name: 'Douro', country: 'PT' }, { id: 'mosel', name: 'Mosel', country: 'DE' },
];

const cache = new Map<string, Promise<RegionMap | null>>();
export function loadMap(id: string): Promise<RegionMap | null> {
  if (!cache.has(id)) {
    cache.set(id, fetch(`/maps/${id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(id)!;
}

/** The map id for a region name ("Bordeaux" → "bordeaux"), or null when there is no map yet. */
export const mapIdFor = (region: string | null | undefined) => (region ? MAPS[normOrigin(region)] ?? null : null);

type OriginWine = { region?: string | null; appellation?: string | null; appellation_id?: string | null };

/** The tasting's main region with a map: the one most of its wines come from. */
export function mainRegion(wines: OriginWine[]): string | null {
  const counts = new Map<string, number>();
  for (const w of wines) {
    const id = mapIdFor(w.region);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [id, n] of counts) if (!best || n > counts.get(best)!) best = id;
  return best;
}

export type MapGroup = { key: string; title: string; count: number; inMap: boolean; whole: boolean; wines: number[] };

/** Groups the wines by where they go on the map: an area, the whole region, or another region. */
export async function groupWines<W extends OriginWine & { id: number }>(map: RegionMap, wines: W[]): Promise<MapGroup[]> {
  const names = new Map((await loadAppellations()).map((a: Appellation) => [a.id, a.name]));
  const groups = new Map<string, MapGroup>();
  const add = (key: string, title: string, inMap: boolean, whole: boolean, w: W) => {
    const g = groups.get(key) ?? { key, title, count: 0, inMap, whole, wines: [] };
    g.count++;
    g.wines.push(w.id);
    groups.set(key, g);
  };
  for (const w of wines) {
    const aid = w.appellation_id ?? '';
    const sameRegion = mapIdFor(w.region) === map.id;
    if (aid && map.areas[aid]) add(aid, names.get(aid) ?? map.areas[aid].title ?? aid, true, false, w);
    else if (sameRegion) add(`whole:${aid || 'region'}`, (aid && names.get(aid)) || w.appellation || map.name, false, true, w);
    else add(`other:${normOrigin(w.region || w.appellation || '?')}`, w.region || w.appellation || '?', false, false, w);
  }
  // In the map first (most wines first), then the whole region, then other regions
  const rank = (g: MapGroup) => (g.inMap ? 0 : g.whole ? 1 : 2);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.title.localeCompare(b.title));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type DrawOptions = {
  /** area id → number of wines (filled and numbered) */
  counts?: Map<string, number>;
  /** fill every area lightly (wines from a region-wide appellation such as Porto) */
  wholeRegion?: boolean;
  /** 'full': the map card; 'mini': small locator; 'background': faint, no labels */
  mode?: 'full' | 'mini' | 'background';
  /** area id → label shown next to the badge */
  titles?: Map<string, string>;
  /** producers' exact places */
  pins?: { lon: number; lat: number; title?: string }[];
};

/** The map as an SVG string. */
export function drawMap(map: RegionMap, opts: DrawOptions = {}): string {
  const { counts = new Map(), wholeRegion = false, mode = 'full', titles = new Map(), pins = [] } = opts;
  const max = Math.max(1, ...counts.values());
  const lines = mode === 'background';
  const parts: string[] = [];
  parts.push(`<svg class="region-map ${mode}" viewBox="0 0 ${map.w} ${map.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(map.name)}">`);
  // Sea, with fine engraving lines along the coast
  parts.push(`<rect class="rm-sea" width="${map.w}" height="${map.h}"/>`);
  if (!lines) {
    for (let i = 1; i <= 4; i++) parts.push(`<path class="rm-wave" d="${map.coast}" transform="translate(${-5 * i} 0)" opacity="${(0.5 - i * 0.1).toFixed(2)}"/>`);
  }
  parts.push(`<path class="rm-land" d="${map.land}"/>`);
  // Appellations: dashed outlines; those with wines filled (darker with more wines)
  for (const [id, a] of Object.entries(map.areas)) {
    const n = counts.get(id) ?? 0;
    const on = n > 0 || wholeRegion;
    const op = n > 0 ? 0.35 + 0.45 * (n / max) : wholeRegion ? 0.28 : 0;
    parts.push(`<path class="rm-area${on ? ' on' : ''}" data-area="${id}" d="${a.d}" style="fill-opacity:${op.toFixed(2)}"/>`);
  }
  if (map.border) parts.push(`<path class="rm-border" d="${map.border}"/>`);
  for (const r of map.rivers) parts.push(`<path class="rm-river" d="${r.d}"/>`);
  parts.push(`<path class="rm-coast" d="${map.coast}"/>`);
  if (mode === 'full') {
    // Badges first, so labels can be placed around them without overlapping
    type Box = { x0: number; y0: number; x1: number; y1: number };
    const taken: Box[] = [];
    const hits = (b: Box) => taken.some((t) => b.x0 < t.x1 && b.x1 > t.x0 && b.y0 < t.y1 && b.y1 > t.y0);
    const badges = [...counts].filter(([id, n]) => n && map.areas[id]).map(([id, n]) => ({ id, n, x: map.areas[id].label[0], y: map.areas[id].label[1] }));
    for (const b of badges) taken.push({ x0: b.x - 15, y0: b.y - 15, x1: b.x + 15, y1: b.y + 15 });
    const titleSvg: string[] = [];
    for (const b of badges) {
      const title = titles.get(b.id) ?? map.areas[b.id].title ?? '';
      if (!title) continue;
      const w = title.length * 8.6, h = 18;
      // Right, left, below, above – the first spot that is free
      const spots: [number, number, string][] = [
        [b.x + 18, b.y + 6, 'start'], [b.x - 18, b.y + 6, 'end'], [b.x, b.y + 32, 'middle'], [b.x, b.y - 22, 'middle'],
        [b.x + 18, b.y + 30, 'start'], [b.x - 18, b.y - 18, 'end'],
      ];
      const box = ([x, y, anchor]: [number, number, string]): Box => {
        const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
        return { x0, y0: y - h + 4, x1: x0 + w, y1: y + 4 };
      };
      const spot = spots.find((sp) => !hits(box(sp)) && box(sp).x0 >= 0 && box(sp).x1 <= map.w) ?? spots[0];
      taken.push(box(spot));
      titleSvg.push(`<text class="rm-badge-title" x="${spot[0].toFixed(0)}" y="${spot[1].toFixed(0)}" text-anchor="${spot[2]}">${esc(title)}</text>`);
    }
    // Towns, unless they would clash with a label or repeat an appellation's name
    const named = [...titles.values()].map((t) => normOrigin(t));
    for (const t of map.towns) {
      const r = t.size === 'big' ? 4.5 : t.size === 'mid' ? 3.5 : 2.6;
      const fs = t.size === 'big' ? 22 : t.size === 'mid' ? 17 : 14;
      const tb = { x0: t.x - 4, y0: t.y - 6 - fs, x1: t.x + 7 + t.name.length * fs * 0.48, y1: t.y + 4 };
      if (t.size !== 'big' && (hits(tb) || named.some((n) => n.includes(normOrigin(t.name).split(' ')[0])))) continue;
      taken.push(tb);
      parts.push(`<g class="rm-town ${t.size}"><circle cx="${t.x}" cy="${t.y}" r="${r}"/><text x="${t.x + 7}" y="${t.y - 6}" font-size="${fs}">${esc(t.name)}</text></g>`);
    }
    // The whole region lit (e.g. port from the Douro): name its parts quietly
    if (wholeRegion && !badges.length) {
      for (const a of Object.values(map.areas)) {
        if (a.title) parts.push(`<text class="rm-part" x="${a.label[0]}" y="${a.label[1]}">${esc(a.title.toUpperCase())}</text>`);
      }
    }
    parts.push(...titleSvg);
    for (const b of badges) {
      parts.push(`<g class="rm-badge" transform="translate(${b.x} ${b.y})"><circle r="13"/><text class="rm-badge-n" y="5">${b.n}</text></g>`);
    }
  }
  if (mode !== 'background') {
    for (const p of pins) {
      const at = mapPoint(map, p.lon, p.lat);
      if (at) parts.push(pinSvg(at[0], at[1], p.title, mode === 'mini' ? 1.6 : 1.2));
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

/** After drawing: zoom to the filled areas (with room around them) when they cover a small part of the map. */
export function fitToAreas(svg: SVGSVGElement, map: RegionMap, minShare = 0.55) {
  const on = [...svg.querySelectorAll<SVGPathElement>('.rm-area.on')];
  if (!on.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of on) {
    const b = p.getBBox();
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  const ratio = map.w / map.h;
  let w = Math.max((x1 - x0) * 1.5, map.w * minShare);
  let h = Math.max((y1 - y0) * 1.5, w / ratio);
  w = Math.max(w, h * ratio);
  if (w >= map.w * 0.95) return;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const x = Math.min(Math.max(cx - w / 2, 0), map.w - w);
  const y = Math.min(Math.max(cy - h / 2, 0), map.h - h);
  svg.setAttribute('viewBox', `${x.toFixed(0)} ${y.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`);
}

/** [1, 2, 3, 5, 9, 10] → "1–3, 5, 9–10" */
export function numberRanges(nums: number[]): string {
  const n = [...new Set(nums)].filter((x) => x > 0).sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < n.length; i++) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    out.push(j > i + 1 ? `${n[i]}–${n[j]}` : j === i + 1 ? `${n[i]}, ${n[j]}` : `${n[i]}`);
    i = j;
  }
  return out.join(', ');
}
