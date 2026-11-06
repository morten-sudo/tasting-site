// Only for /superadmin/dev/maps/: the structure of a region's detailed map – every area drawn and named – and how its
// areas relate: how big each is and which lie in, contain or overlap others (measured by drawing each area on a small
// canvas and counting pixels). The real maps (drawMap() in region-map.ts) use the levels stored in the map's `within`
// (scripts/map-hierarchy.py, the same 90 % rule measured on the shapes).
import { anchored, drawMap, type RegionMap } from './region-map';
import { esc } from './ui/dom';

/** The whole map in the light tone with every area named, smaller areas on top (the structure maps). */
export function drawStructure(map: RegionMap, names: Map<string, string>): string {
  const ids = Object.keys(map.areas).sort((a, b) => map.areas[a].d.length - map.areas[b].d.length);
  const labels = ids.map((id) => anchored(map.areas[id].label[0], map.areas[id].label[1], `<text class="rm-name">${esc(names.get(id) ?? id)}</text>`));
  return drawMap(map).replace(/<\/svg>$/, `${labels.join('')}</svg>`);
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

