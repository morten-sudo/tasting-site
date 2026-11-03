// "Where the wines come from" on the tasting's page (src/pages/tasting/index.astro): the main region's detailed map with
// the wines' appellations, a legend, and a small country map for wines from another region – or, when no wine comes
// from a region with a detailed map, the overview map with a numbered pin per place. Also drawn on /dev/maps/.
import { loadMap, mainRegion, groupWines, drawMap, fitToAreas, numberRanges } from './region-map';
import { placeOf, loadOverview, overviewFor, focusFor, drawOverview, type Place } from './overview-map';
import { mapZoom } from './ui/map-zoom';
import { mk } from './ui/dom';
import { countryName } from './origin';
import { setMapCredit, OVERVIEW_SOURCES } from './wine-map';
import { t } from '../i18n';

export type MapWine = { id: number; sort_order: number; name: string; region: string | null; appellation: string | null; appellation_id: string | null; country: string | null;
  producer: string | null; producer_lat?: number | null; producer_lon?: number | null };

/** The page's parts: the faint map behind the heading, the section (shown when there is a map), the map, legend and credit. */
export type OriginParts = { hero: HTMLElement; block: HTMLElement; box: HTMLElement; legend: HTMLElement; credit: HTMLElement };

export async function showOrigins(wines: MapWine[], el: OriginParts) {
  const region = mainRegion(wines);
  const map = region ? await loadMap(region) : null;
  if (!map) { await showOverviewOrigins(wines, el); return; }
  const groups = await groupWines(map, wines);
  const counts = new Map(groups.filter((g) => g.inMap).map((g) => [g.key, g.count]));
  const titles = new Map(groups.filter((g) => g.inMap).map((g) => [g.key, g.title]));
  const whole = groups.some((g) => g.whole);
  // Faint map behind the heading
  el.hero.innerHTML = drawMap(map, { mode: 'background', counts, wholeRegion: whole && !counts.size });
  // The map card; on phones it zooms to the filled appellations
  const box = el.box;
  // Producers with an exact place get a pin (one per producer)
  const pins = [...new Map(wines.filter((w) => w.producer_lat != null && w.producer_lon != null)
    .map((w) => [`${w.producer_lat},${w.producer_lon}`, { lon: w.producer_lon!, lat: w.producer_lat!, title: w.producer ?? '' }])).values()];
  box.innerHTML = drawMap(map, { counts, titles, wholeRegion: whole && !counts.size, pins });
  // Shown before zooming: sizes can only be measured on a visible map
  el.block.hidden = false;
  if (matchMedia('(max-width: 40rem)').matches) fitToAreas(box.querySelector('svg')!, map);
  mapZoom(box);
  // The legend: number of wines per appellation, with their numbers in the evening
  const no = new Map(wines.map((w, i) => [w.id, i + 1]));
  const byId = new Map(wines.map((w) => [w.id, w]));
  el.legend.replaceChildren(...await Promise.all(groups.map(async (g) => {
    const nums = t('map.wineNumbers', { list: numberRanges(g.wines.map((id) => no.get(id) ?? 0)) });
    const li = legendItem(g.inMap ? 'in-map' : g.whole ? 'whole' : 'other', g.count, g.title,
      g.inMap ? nums : g.whole ? `${t('map.wholeRegion', { region: map.name })} · ${nums}` : `${t('map.otherRegion')} · ${nums}`);
    // Wines from another region: a small map of their country with the place marked
    if (!g.inMap && !g.whole) {
      const places = (await Promise.all(g.wines.map((id) => placeOf(byId.get(id)!)))).filter((p): p is Place => !!p);
      if (places.length) {
        const [ov, focus] = await Promise.all([loadOverview(overviewFor(places)), focusFor(places)]);
        if (ov) {
          const inset = mk('span', 'map-box');
          inset.innerHTML = drawOverview(ov, places.map((p) => ({ lon: p.lon, lat: p.lat })), focus, 'inset');
          li.querySelector('.txt')!.append(inset);
        }
      }
    }
    return li;
  })));
  setMapCredit(el.box, map.sources, pins.length > 0, el.credit);
  el.block.hidden = false;
}

// No detailed map for these wines: the overview map with a numbered pin per place
async function showOverviewOrigins(wines: MapWine[], el: OriginParts) {
  const placed = (await Promise.all(wines.map(async (w) => ({ w, p: await placeOf(w) })))).filter((x) => x.p) as { w: MapWine; p: Place }[];
  if (!placed.length) return;
  const groups = new Map<string, { p: Place; wines: MapWine[] }>();
  for (const { w, p } of placed) {
    const key = `${p.lon.toFixed(2)},${p.lat.toFixed(2)}`;
    const g = groups.get(key) ?? { p, wines: [] };
    g.wines.push(w);
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => b.wines.length - a.wines.length);
  const places = list.map((g) => g.p);
  const [ov, focus] = await Promise.all([loadOverview(overviewFor(places)), focusFor(places)]);
  if (!ov) return;
  const pins = list.map((g) => ({ lon: g.p.lon, lat: g.p.lat, n: g.wines.length, label: g.p.label }));
  el.box.innerHTML = drawOverview(ov, pins, focus, 'full');
  mapZoom(el.box);
  el.hero.innerHTML = '';
  const no = new Map(wines.map((w, i) => [w.id, i + 1]));
  el.legend.replaceChildren(...list.map((g) => {
    const where = [g.wines[0].region, countryName(g.p.country)].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
    const nums = t('map.wineNumbers', { list: numberRanges(g.wines.map((w) => no.get(w.id) ?? 0)) });
    return legendItem('in-map', g.wines.length, g.p.label, [where, nums].filter(Boolean).join(' · '));
  }));
  setMapCredit(el.box, OVERVIEW_SOURCES, false, el.credit);
  el.block.hidden = false;
}

// One line of the map's legend (component 23): the number of wines in a circle, the place, what it covers
function legendItem(kind: string, count: number, titleText: string, subText: string) {
  const li = mk('li', kind);
  const text = mk('span', 'txt');
  text.append(mk('b', '', titleText), mk('span', 'sub', subText));
  li.append(mk('span', 'no', String(count)), text);
  return li;
}
