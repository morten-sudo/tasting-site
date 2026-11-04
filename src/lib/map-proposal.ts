// A PROPOSAL, not used on the real pages (only on /superadmin/dev/maps/): a wine's map in three tones on a region's detailed map
// (public/maps/<region>.json, the same data as drawMap() in region-map.ts). The wine's lowest known area is dark, the
// areas that contain it a middle tone, every other area light – with the borders of all areas kept.
// Also the geometry the dev page needs to describe the maps: how big each area is and which areas lie in, contain or
// overlap others (measured by drawing each area on a small canvas and counting pixels).
import { anchored, pinSvg, mapPoint, type RegionMap } from './region-map';
import { esc } from './ui/dom';

export type ProposalOptions = {
  /** the wine's lowest known area (dark) */
  dark?: string[];
  /** the areas that contain it (middle tone) */
  mid?: string[];
  /** a name shown large over the map when no area is dark (e.g. "Porto" on all of Douro) */
  label?: string;
  /** area id → name: every area named (the structure maps on /superadmin/dev/maps/) */
  names?: Map<string, string>;
  /** the dark area's name (defaults to names / the area's title) */
  darkName?: string;
  pins?: { lon: number; lat: number; title?: string }[];
};

/** The proposal's map as an SVG string (class "region-map proposal"; tones in components.css). */
export function drawProposal(map: RegionMap, o: ProposalOptions = {}): string {
  const dark = new Set((o.dark ?? []).filter((id) => map.areas[id]));
  const mid = new Set((o.mid ?? []).filter((id) => map.areas[id] && !dark.has(id)));
  const tone = (id: string) => (dark.has(id) ? 'is-dark' : mid.has(id) ? 'is-mid' : 'is-light');
  const rank = (id: string) => (dark.has(id) ? 2 : mid.has(id) ? 1 : 0);
  // Light first, then middle, then dark; within a tone the larger areas first (a rough size from the path's length)
  const ids = Object.keys(map.areas).sort((a, b) => rank(a) - rank(b) || map.areas[b].d.length - map.areas[a].d.length);
  const p: string[] = [`<svg class="region-map proposal" viewBox="0 0 ${map.w} ${map.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(map.name)}">`,
    `<rect class="rm-sea" width="${map.w}" height="${map.h}"/>`];
  for (let i = 1; i <= 4; i++) p.push(`<path class="rm-wave" d="${map.coast}" transform="translate(${-5 * i} 0)" opacity="${(0.5 - i * 0.1).toFixed(2)}"/>`);
  p.push(`<path class="rm-land" d="${map.land}"/>`);
  // All fills first, then all outlines: an area drawn over another never hides its border
  for (const id of ids) p.push(`<path class="mp-fill ${tone(id)}" data-area="${id}" d="${map.areas[id].d}"/>`);
  for (const id of ids) p.push(`<path class="mp-line ${tone(id)}" d="${map.areas[id].d}"/>`);
  if (map.border) p.push(`<path class="rm-border" d="${map.border}"/>`);
  for (const r of map.rivers) p.push(`<path class="rm-river" d="${r.d}"/>`);
  p.push(`<path class="rm-coast" d="${map.coast}"/>`);
  const nameOf = (id: string) => o.names?.get(id) ?? map.areas[id].title ?? id;
  const darkName = dark.size ? (o.darkName ?? nameOf([...dark][0])) : '';
  for (const t of map.towns) {
    if (darkName && t.name.split(/[\s-]/)[0] === darkName.split(/[\s-]/)[0]) continue;
    const r = t.size === 'big' ? 4.5 : t.size === 'mid' ? 3.5 : 2.6;
    const fs = t.size === 'big' ? 22 : t.size === 'mid' ? 17 : 14;
    p.push(anchored(t.x, t.y, `<circle r="${r}"/><text x="7" y="-6" font-size="${fs}">${esc(t.name)}</text>`, `rm-town ${t.size}`));
  }
  // Every area named (structure maps), smaller areas on top
  if (o.names) {
    for (const id of [...ids].reverse()) {
      const [x, y] = map.areas[id].label;
      p.push(anchored(x, y, `<text class="mp-name ${tone(id)}">${esc(nameOf(id))}</text>`));
    }
  } else if (darkName) {
    const [x, y] = map.areas[[...dark][0]].label;
    p.push(anchored(x, y, `<text class="mp-lead">${esc(darkName)}</text>`));
  }
  if (o.label && !dark.size) {
    // In the middle of the areas' label points
    const pts = Object.values(map.areas).map((a) => a.label);
    const x = pts.reduce((s, q) => s + q[0], 0) / pts.length, y = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    p.push(anchored(x, y, `<text class="mp-lead big">${esc(o.label)}</text>`));
  }
  for (const pin of o.pins ?? []) {
    const at = mapPoint(map, pin.lon, pin.lat);
    if (at) p.push(pinSvg(at[0], at[1], pin.title, 1.2));
  }
  p.push('</svg>');
  return p.join('');
}

export type AreaFacts = {
  id: string;
  /** share of all the map's areas together (0–1) */
  share: number;
  /** areas it lies (at least 90 %) inside */
  within: string[];
  /** areas that lie inside it */
  contains: string[];
  /** areas with (nearly) the same shape */
  same: string[];
  /** areas it partly overlaps, with the share of the smaller one that overlaps */
  overlaps: { id: string; share: number }[];
};

const factsCache = new Map<string, AreaFacts[]>();

/** How the map's areas relate, measured on a canvas (half the map's size): a rough test, good to a few per cent. */
export function areaFacts(map: RegionMap): AreaFacts[] {
  const hit = factsCache.get(map.id);
  if (hit) return hit;
  const S = 0.5, W = Math.ceil(map.w * S), H = Math.ceil(map.h * S);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const ids = Object.keys(map.areas);
  const masks = new Map<string, Uint8Array>(), pixels = new Map<string, number[]>();
  const union = new Uint8Array(W * H);
  for (const id of ids) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.fill(new Path2D(map.areas[id].d));
    const data = ctx.getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H), list: number[] = [];
    for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] > 127) { m[i] = 1; list.push(i); union[i] = 1; }
    masks.set(id, m);
    pixels.set(id, list);
  }
  const total = union.reduce((s, v) => s + v, 0) || 1;
  const size = (id: string) => pixels.get(id)!.length || 1;
  const inter = new Map<string, number>();
  for (const a of ids) for (const b of ids) {
    if (a >= b) continue;
    const mb = masks.get(b)!;
    let n = 0;
    for (const i of pixels.get(a)!) n += mb[i];
    inter.set(`${a}|${b}`, n);
  }
  const both = (a: string, b: string) => inter.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0;
  const out = ids.map((a): AreaFacts => {
    const f: AreaFacts = { id: a, share: size(a) / total, within: [], contains: [], same: [], overlaps: [] };
    for (const b of ids) {
      if (a === b) continue;
      const n = both(a, b);
      if (!n) continue;
      const inA = n / size(a), inB = n / size(b);
      if (inA >= 0.9 && inB >= 0.9) f.same.push(b);
      else if (inA >= 0.9) f.within.push(b);
      else if (inB >= 0.9) f.contains.push(b);
      else if (n / Math.min(size(a), size(b)) >= 0.08) f.overlaps.push({ id: b, share: n / Math.min(size(a), size(b)) });
    }
    return f;
  });
  factsCache.set(map.id, out);
  return out;
}

/** The areas that contain an area (for the proposal's middle tone), largest last. */
export const containersOf = (map: RegionMap, id: string) =>
  (areaFacts(map).find((f) => f.id === id)?.within ?? []);
