// Region maps for tastings: the wine region in an old atlas style – always the whole region with the borders of its
// areas, the wines' lowest known areas strongest and the levels between lighter (WIN-293). The map data (public/maps/<region>.json) is built from open geodata
// by scripts/build-maps.py.
import { normOrigin, loadAppellations, matchAppellation, type Appellation } from './origin';
import { esc } from './ui/dom';

export type RegionMap = {
  id: string; name: string; w: number; h: number;
  land: string; coast: string; border: string;
  rivers: { name: string; d: string }[];
  areas: Record<string, { d: string; label: [number, number]; title?: string }>;
  /** appellations that cover the whole region (Porto, Bourgogne AOC …): the region is their lowest level */
  whole: string[];
  /** area id → the areas it lies in (scripts/map-hierarchy.py), largest first */
  within?: Record<string, string[]>;
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

/** A map pin whose tip is at (x, y). s: the labels' scale (labelScale()) */
export const pinSvg = (x: number, y: number, title = '', scale = 1, s = 1) =>
  `<g class="rm-pin" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale})">${title ? `<title>${esc(title)}</title>` : ''}<g class="rm-s"${s !== 1 ? ` transform="scale(${s.toFixed(3)})"` : ''}><path d="M0 0 C-3 -9 -11 -13 -11 -22 A11 11 0 1 1 11 -22 C11 -13 3 -9 0 0 Z"/><circle cy="-22" r="4"/></g></g>`;
/** A marker or label anchored at (x, y): its content is drawn around 0 0 inside .rm-s, which the map's zoom
 *  (map-zoom.ts) scales back so names, numbers, pins and dots keep their size on screen at any zoom. s: the labels'
 *  scale at the starting view (labelScale()) */
export const anchored = (x: number, y: number, inner: string, cls = '', s = 1) =>
  `<g${cls ? ` class="${cls}"` : ''} transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g class="rm-s"${s !== 1 ? ` transform="scale(${s.toFixed(3)})"` : ''}>${inner}</g></g>`;

/** How much bigger names, numbers and pins are drawn so the area's name is at least about 12.5 px on screen when the
 *  whole region is shown in a box `width` px wide (a phone): 1 on a large screen. */
export const labelScale = (map: RegionMap, width: number) => (width > 0 ? Math.max(1, 12.5 / (17 * (width / map.w))) : 1);
/** The width of a map box, also while it (or a parent) is still hidden – measured without a paint in between. */
export function boxWidth(el: HTMLElement): number {
  const hidden: HTMLElement[] = [];
  for (let e: HTMLElement | null = el; e; e = e.parentElement) if (e.hidden) { hidden.push(e); e.hidden = false; }
  const w = el.clientWidth;
  for (const e of hidden) e.hidden = true;
  return w;
}

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

// ---------- The wine's levels on the map (WIN-293) ----------
// The map always shows the whole region, with the borders of every area. A wine's lowest known area is marked
// strongest; the levels between the region and it (the areas it lies in on the map, and the other areas of its
// sub-region on the appellation list, e.g. Médoc for Pauillac) in a lighter tone; the rest of the region is light.
// Nothing new is asked of the host: the levels come from the map (`within`, scripts/map-hierarchy.py) and the list.

/** An area's name: the appellation list's, else the map's title, else its id written out ("le-mesnil-sur-oger" → "Le Mesnil-sur-Oger") */
export function areaName(map: RegionMap, id: string, apps: Appellation[]): string {
  return apps.find((a) => a.id === id)?.name ?? map.areas[id]?.title
    ?? id.split('-').map((p, i) => (i && /^(sur|de|du|des|la|le|les|d|en|di|del|della)$/.test(p) ? p : p[0].toUpperCase() + p.slice(1))).join('-');
}

/** Where one wine goes on its region's map. */
export type Level = {
  /** 'area': an area of the map; 'pin': an appellation of the region with no area (a pin with its name);
   *  'region': nothing below the region is known (or the appellation covers the whole region, `whole`) */
  kind: 'area' | 'pin' | 'region';
  /** the area's id (kind 'area'), else the appellation's id or '' */
  id: string;
  /** the lowest level's name: the area, the appellation or the region */
  name: string;
  /** the areas between the region and the lowest level (lighter tone) */
  mid: string[];
  /** the name of the level between, for the legend ("Médoc", "Côte de Nuits"), when there is one */
  midName: string | null;
  /** kind 'pin': the appellation's place */
  pin?: { lon: number; lat: number };
};

type LevelWine = { appellation?: string | null; appellation_id?: string | null };

/** The areas whose name is in a piece of text (the longest), for areas that are not on the appellation list (Ambonnay, Kasel …) */
function areaInText(map: RegionMap, text: string | null | undefined, apps: Appellation[]): string | null {
  const hay = ` ${normOrigin(text)} `;
  if (!hay.trim()) return null;
  let best: string | null = null, len = 0;
  for (const id of Object.keys(map.areas)) {
    for (const n of new Set([normOrigin(areaName(map, id, apps)), normOrigin(id)])) {
      if (n && n.length > len && hay.includes(` ${n} `)) { best = id; len = n.length; }
    }
  }
  return best;
}

/** The wine's lowest known level on the map and the levels between it and the region. */
export function levelOf(map: RegionMap, w: LevelWine, apps: Appellation[]): Level {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const aid = w.appellation_id || (w.appellation ? matchAppellation(apps, w.appellation)?.id ?? '' : '');
  const app = aid ? byId.get(aid) : undefined;
  // The levels between: the areas it lies in, and the areas of the same sub-region (or the area named after it)
  const between = (self: string, sub: string | null | undefined) => {
    const mid = new Set(map.within?.[self] ?? []);
    const s = normOrigin(sub);
    if (s) for (const id of Object.keys(map.areas)) {
      if (normOrigin(byId.get(id)?.subregion) === s || normOrigin(areaName(map, id, apps)) === s) mid.add(id);
    }
    mid.delete(self);
    const name = sub?.trim() || (map.within?.[self]?.[0] ? areaName(map, map.within[self][0], apps) : null);
    return { mid: [...mid], midName: mid.size ? name : null };
  };
  const area = aid && map.areas[aid] ? aid : areaInText(map, w.appellation, apps);
  if (area) return { kind: 'area', id: area, name: areaName(map, area, apps), ...between(area, byId.get(area)?.subregion) };
  // An appellation of the region that the map cannot fill: a pin with its name, its sub-region lighter
  if (app && !map.whole.includes(app.id) && mapIdFor(app.region) === map.id && app.lat != null && app.lon != null && mapPoint(map, app.lon, app.lat)) {
    return { kind: 'pin', id: app.id, name: app.name, pin: { lon: app.lon, lat: app.lat }, ...between('', app.subregion) };
  }
  // Nothing lower is known: the region (named after the appellation when there is one, e.g. "Porto" on all of Douro)
  return { kind: 'region', id: app?.id ?? '', name: app?.name || w.appellation?.trim() || map.name, mid: [], midName: null };
}

export type MapGroup = { key: string; title: string; count: number; inMap: boolean; whole: boolean; wines: number[]; level: Level };

/** Groups the wines by their lowest level on the map: an area, an appellation's pin, or the whole region. */
export async function groupWines<W extends OriginWine & { id: number }>(map: RegionMap, wines: W[]): Promise<MapGroup[]> {
  const apps = await loadAppellations();
  const groups = new Map<string, MapGroup>();
  for (const w of wines) {
    const level = levelOf(map, w, apps);
    const key = level.kind === 'area' ? level.id : `${level.kind}:${level.id || 'region'}`;
    const g = groups.get(key) ?? { key, title: level.name, count: 0, inMap: level.kind !== 'region', whole: level.kind === 'region', wines: [], level };
    g.count++;
    g.wines.push(w.id);
    groups.set(key, g);
  }
  // On the map first (most wines first), then the whole region
  const rank = (g: MapGroup) => (g.inMap ? 0 : 1);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.title.localeCompare(b.title));
}

/** drawMap()'s options for a set of wines' groups: strongest wins (an area that is one wine's lowest and another's level
 *  between is strong); the whole region is marked only when no wine has a lower level. */
export function markings(groups: MapGroup[]): Pick<DrawOptions, 'counts' | 'titles' | 'mid' | 'wholeRegion' | 'named'> {
  const counts = new Map<string, number>(), titles = new Map<string, string>(), mid = new Set<string>();
  const named: NonNullable<DrawOptions['named']> = [];
  for (const g of groups) {
    const l = g.level;
    if (l.kind === 'area') { counts.set(l.id, g.count); titles.set(l.id, l.name); }
    if (l.kind === 'pin' && l.pin) named.push({ ...l.pin, title: l.name });
    for (const m of l.mid) mid.add(m);
  }
  for (const id of counts.keys()) mid.delete(id);
  return { counts, titles, mid, named, wholeRegion: !counts.size && !named.length && groups.some((g) => g.whole) };
}

type DrawOptions = {
  /** area id → number of wines: the wines' lowest known areas (strongest, numbered) */
  counts?: Map<string, number>;
  /** the levels between the region and the wines' areas (lighter tone) */
  mid?: Set<string>;
  /** the region itself is the lowest known level: every area strongest */
  wholeRegion?: boolean;
  /** 'full': the map (the tasting's and a wine's); 'background': faint, no labels, behind a heading */
  mode?: 'full' | 'background';
  /** false: no numbered badges – the filled area's name only (a wine's own map) */
  badges?: boolean;
  /** area id → label shown next to the badge */
  titles?: Map<string, string>;
  /** appellations the map cannot fill: a pin with the name beside it */
  named?: { lon: number; lat: number; title: string }[];
  /** producers' exact places */
  pins?: { lon: number; lat: number; title?: string }[];
  /** the labels' scale (labelScale()): names, numbers, pins and towns this much bigger, placed so they do not overlap */
  scale?: number;
  /** the map box's width in px (boxWidth()): the zoom buttons' corner (map-zoom.ts) is kept free of every label */
  box?: number;
};

/** Whether (x, y) lies inside an area's outline (an SVG path of M, L and Z; even-odd, as the outlines do not cross) */
function inPath(d: string, x: number, y: number): boolean {
  let inside = false;
  for (const sub of d.split(/(?=M)/)) {
    const n = (sub.match(/-?[\d.]+/g) ?? []).map(Number);
    for (let i = 0, j = n.length - 2; i < n.length - 1; j = i, i += 2) {
      const [xi, yi, xj, yj] = [n[i], n[i + 1], n[j], n[j + 1]];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** The map as an SVG string. */
export function drawMap(map: RegionMap, opts: DrawOptions = {}): string {
  const { counts = new Map(), mid = new Set(), wholeRegion = false, mode = 'full', titles = new Map(), pins = [], named = [], badges: numbered = true, scale: S = 1, box: boxPx = 0 } = opts;
  const strong = (id: string) => wholeRegion || (counts.get(id) ?? 0) > 0;
  const tone = (id: string) => (strong(id) ? 'is-strong' : mid.has(id) ? 'is-mid' : 'is-light');
  const parts: string[] = [];
  parts.push(`<svg class="region-map ${mode}" viewBox="0 0 ${map.w} ${map.h}"${S !== 1 ? ` data-s="${S.toFixed(3)}"` : ''} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(map.name)}">`);
  if (mode === 'background') {
    // Faint, behind a heading: the outlines, the wines' areas filled
    for (const [id, a] of Object.entries(map.areas)) parts.push(`<path class="rm-area${strong(id) ? ' on' : ''}" data-area="${id}" d="${a.d}"/>`);
    if (map.border) parts.push(`<path class="rm-border" d="${map.border}"/>`);
    for (const r of map.rivers) parts.push(`<path class="rm-river" d="${r.d}"/>`);
    parts.push(`<path class="rm-coast" d="${map.coast}"/></svg>`);
    return parts.join('');
  }
  // Sea, with fine engraving lines along the coast
  parts.push(`<rect class="rm-sea" width="${map.w}" height="${map.h}"/>`);
  for (let i = 1; i <= 4; i++) parts.push(`<path class="rm-wave" d="${map.coast}" transform="translate(${-5 * i} 0)" opacity="${(0.5 - i * 0.1).toFixed(2)}"/>`);
  parts.push(`<path class="rm-land" d="${map.land}"/>`);
  // The whole region in three tones: light, the levels between, the lowest areas. Light first, then the lighter tone,
  // then the strongest (the larger areas first within a tone); all fills before all outlines, so no area hides a border
  const rank = (id: string) => (strong(id) ? 2 : mid.has(id) ? 1 : 0);
  const ids = Object.keys(map.areas).sort((a, b) => rank(a) - rank(b) || map.areas[b].d.length - map.areas[a].d.length);
  for (const id of ids) parts.push(`<path class="rm-fill ${tone(id)}" data-area="${id}" d="${map.areas[id].d}"/>`);
  for (const id of ids) parts.push(`<path class="rm-line ${tone(id)}" d="${map.areas[id].d}"/>`);
  if (map.border) parts.push(`<path class="rm-border" d="${map.border}"/>`);
  for (const r of map.rivers) parts.push(`<path class="rm-river" d="${r.d}"/>`);
  parts.push(`<path class="rm-coast" d="${map.coast}"/>`);
  // Badges first, so labels can be placed around them without overlapping. Sizes and offsets are the labels' own (as
  // drawn inside .rm-s), times S on the map
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const taken: Box[] = [];
  const hits = (b: Box) => taken.some((t) => b.x0 < t.x1 && b.x1 > t.x0 && b.y0 < t.y1 && b.y1 > t.y0);
  const around = (x: number, y: number, x0: number, y0: number, x1: number, y1: number): Box => ({ x0: x + x0 * S, y0: y + y0 * S, x1: x + x1 * S, y1: y + y1 * S });
  const marks = [...counts].filter(([id, n]) => n && map.areas[id]).map(([id, n]) => ({ id, n, x: map.areas[id].label[0], y: map.areas[id].label[1], pin: false, title: titles.get(id) ?? map.areas[id].title ?? '' }));
  const pinned = named.flatMap((p) => { const at = mapPoint(map, p.lon, p.lat); return at ? [{ id: '', n: 0, x: at[0], y: at[1], pin: true, title: p.title }] : []; });
  // Badges of neighbouring areas (Saint-Estèphe, Pauillac, Saint-Julien on a phone) moved apart until they are free:
  // each in turn (most wines first) at its area's point, else a little further out around it
  if (numbered) {
    const placed: { x: number; y: number }[] = [];
    const R = 15 * S;
    for (const b of [...marks].sort((a, c) => c.n - a.n || a.y - c.y)) {
      const free = (x: number, y: number) => placed.every((q) => Math.hypot(q.x - x, q.y - y) >= 2 * R);
      let at: [number, number] = [b.x, b.y];
      search: for (let ring = 1; ring <= 4 && !free(...at); ring++) {
        for (let k = 0; k < 8 * ring; k++) {
          const a = (k / (8 * ring)) * 2 * Math.PI + Math.PI / 2;
          const x = b.x + Math.cos(a) * R * 1.1 * ring, y = b.y + Math.sin(a) * R * 1.1 * ring;
          if (free(x, y) && x > R && x < map.w - R && y > R && y < map.h - R) { at = [x, y]; break search; }
        }
      }
      [b.x, b.y] = at;
      placed.push({ x: b.x, y: b.y });
      taken.push(around(b.x, b.y, -15, -15, 15, 15));
    }
  }
  for (const p of pinned) taken.push(around(p.x, p.y, -14 * 1.2, -34 * 1.2, 14 * 1.2, 0));
  // The zoom buttons (.map-zoom: 0.5rem from the corner, two 2.25rem buttons 0.25rem apart, top right) at the starting
  // view, with a little room: no name under them
  if (boxPx > 0) { const k = boxPx / map.w; taken.push({ x0: map.w - 52 / k, y0: 0, x1: map.w, y1: 92 / k }); }
  // The big towns are always shown: placed before the names, so the names go around them
  // Names' widths: Inter measured at about 0.57 of the font size per letter (towns) and up to 0.61 (the wines'
  // names, weight 600), a little room added so no two names touch
  const townBox = (t: RegionMap['towns'][number], fs: number, left: boolean) => (left
    ? around(t.x, t.y, -7 - t.name.length * fs * 0.6, -6 - fs, 4, 4) : around(t.x, t.y, -4, -6 - fs, 7 + t.name.length * fs * 0.6, 4));
  const townSize = (t: RegionMap['towns'][number]) => (t.size === 'big' ? 22 : t.size === 'mid' ? 17 : 14);
  const bigSide = new Map<RegionMap['towns'][number], boolean>();
  const bigBox = new Map<RegionMap['towns'][number], Box>();
  for (const t of map.towns.filter((x) => x.size === 'big')) {
    // Right of the dot, else left: on the map and clear of the wines' numbers, pins and the zoom buttons; with no
    // such side the name is left out
    const fits = (l: boolean) => { const q = townBox(t, 22, l); return q.x0 >= 0 && q.x1 <= map.w && !hits(q); };
    if (!fits(false) && !fits(true)) continue;
    const left = !fits(false);
    bigSide.set(t, left);
    bigBox.set(t, townBox(t, 22, left));
  }
  const meets = (q: Box, t: Box) => q.x0 < t.x1 && q.x1 > t.x0 && q.y0 < t.y1 && q.y1 > t.y0;
  const onBig = (q: Box) => [...bigBox.values()].some((t) => meets(q, t));
  const titleSvg: string[] = [];
  for (const b of [...marks, ...pinned]) {
    if (!b.title) continue;
    const w = b.title.length * 17 * 0.64, h = 18;
    // Right, left, below, above – the first spot that is free (offsets from the mark)
    const spots: [number, number, string][] = b.pin ? [[18, -22, 'start'], [-18, -22, 'end'], [0, 20, 'middle'], [0, -48, 'middle']]
      : numbered ? [[18, 6, 'start'], [-18, 6, 'end'], [0, 32, 'middle'], [0, -22, 'middle'], [18, 30, 'start'], [-18, -18, 'end'], [-18, 30, 'end'], [18, -18, 'start']]
      : [[0, 6, 'middle']];
    const box = ([dx, dy, anchor]: [number, number, string]): Box => {
      const x0 = anchor === 'start' ? dx : anchor === 'end' ? dx - w : dx - w / 2;
      return around(b.x, b.y, x0, dy - h + 4, x0 + w, dy + 4);
    };
    // The first free spot inside the map (also clear of the big towns); else one that only covers a big town (the
    // wine's name wins, the town is left out). On the tasting's numbered map a name with no free spot is left out: its
    // number stays and the legend names it. A wine's own map (one name) takes the spot that covers the fewest names
    const inside = spots.filter((sp) => box(sp).x0 >= 0 && box(sp).x1 <= map.w && box(sp).y0 >= 0 && box(sp).y1 <= map.h);
    const clashes = (sp: [number, number, string]) => taken.filter((t) => meets(box(sp), t)).length;
    const spot = inside.find((sp) => !hits(box(sp)) && !onBig(box(sp))) ?? inside.find((sp) => !hits(box(sp)))
      ?? (numbered ? undefined : [...inside].sort((p, q) => clashes(p) - clashes(q))[0] ?? spots[0]);
    if (!spot) continue;
    taken.push(box(spot));
    for (const [t, q] of bigBox) if (meets(box(spot), q)) bigBox.delete(t);
    titleSvg.push(anchored(b.x, b.y, `<text class="rm-badge-title" x="${spot[0]}" y="${spot[1]}" text-anchor="${spot[2]}">${esc(b.title)}</text>`, '', S));
  }
  // Towns, unless they would clash with a label or repeat an appellation's name
  const named2 = [...marks, ...pinned].map((m) => normOrigin(m.title));
  // The whole region marked (e.g. port from the Douro): its parts named quietly, after the big and mid towns (Peso da
  // Régua, Pinhão) and before the small ones. Each name at its area's point, else moved a little within its area, so it
  // never covers a town, a wine's name, the zoom buttons or the map's edge; with no free spot it is left out
  const partSvg: string[] = [];
  const placeParts = () => {
    const fs = 15 * S;
    for (const [, a] of Object.entries(map.areas).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) {
      if (!a.title) continue;
      // The site writes the names as they are (body font, no capitals since the maps' lettering was made one style)
      const title = a.title;
      const w = title.length * fs * 0.6, h = fs * 1.3;
      const box = (x: number, y: number): Box => ({ x0: x - w / 2, y0: y - fs * 0.36 - h / 2, x1: x + w / 2, y1: y - fs * 0.36 + h / 2 });
      const spots: [number, number][] = [];
      for (const dy of [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -2.5, 2.5, -3, 3]) {
        for (const dx of [0, -0.15, 0.15, -0.3, 0.3]) {
          // Kept inside the map's edges
          spots.push([Math.min(Math.max(a.label[0] + dx * w, w / 2 + 4), map.w - w / 2 - 4), a.label[1] + dy * fs]);
        }
      }
      const dist = ([x, y]: [number, number]) => Math.hypot(x - a.label[0], y - a.label[1]);
      spots.sort((p, q) => dist(p) - dist(q));
      const spot = spots.find(([x, y]) => {
        const q = box(x, y);
        return q.x0 >= 0 && q.x1 <= map.w && q.y0 >= 0 && q.y1 <= map.h && !hits(q) && inPath(a.d, x, y - fs * 0.36);
      });
      if (!spot) continue;
      taken.push(box(...spot));
      partSvg.push(anchored(spot[0], spot[1], `<text class="rm-part">${esc(title)}</text>`, '', S));
    }
  };
  const sizeRank = (t: RegionMap['towns'][number]) => (t.size === 'big' ? 0 : t.size === 'mid' ? 1 : 2);
  let partsPlaced = !wholeRegion;
  for (const t of map.towns.map((t, i) => ({ t, i })).sort((p, q) => sizeRank(p.t) - sizeRank(q.t) || p.i - q.i).map((o) => o.t)) {
    if (!partsPlaced && sizeRank(t) === 2) { placeParts(); partsPlaced = true; }
    const r = t.size === 'big' ? 4.5 : t.size === 'mid' ? 3.5 : 2.6;
    const fs = townSize(t);
    let left = bigSide.get(t) ?? false;
    if (t.size === 'big') {
      const q = bigBox.get(t);
      if (!q) continue;
      taken.push(q);
    } else {
      if (named2.some((n) => n.includes(normOrigin(t.name).split(' ')[0]))) continue;
      // Right of the dot, else left; never off the map or on a name
      const ok = (l: boolean) => { const b = townBox(t, fs, l); return !hits(b) && b.x0 >= 0 && b.x1 <= map.w; };
      if (ok(false)) left = false; else if (ok(true)) left = true; else continue;
      taken.push(townBox(t, fs, left));
    }
    parts.push(anchored(t.x, t.y, `<circle r="${r}"/><text x="${left ? -7 : 7}" y="-6" font-size="${fs}"${left ? ' text-anchor="end"' : ''}>${esc(t.name)}</text>`, `rm-town ${t.size}`, S));
  }
  if (!partsPlaced) placeParts();
  parts.push(...partSvg);
  for (const p of pinned) parts.push(pinSvg(p.x, p.y, p.title, 1.2, S));
  for (const p of pins) {
    const at = mapPoint(map, p.lon, p.lat);
    if (at) parts.push(pinSvg(at[0], at[1], p.title, 1.2, S));
  }
  parts.push(...titleSvg);
  if (numbered) for (const b of marks) {
    parts.push(anchored(b.x, b.y, `<circle r="13"/><text class="rm-badge-n" y="5">${b.n}</text>`, 'rm-badge', S));
  }
  parts.push('</svg>');
  return parts.join('');
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
