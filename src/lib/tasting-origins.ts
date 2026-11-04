// "Where the wines come from" on the tasting's page (src/pages/tasting/index.astro), also seen by the host there:
// one tab per region (the wines' region field, WIN-256) – none with one region. Each tab shows its region: the
// detailed map of the whole region with each wine's lowest known area strongest and the levels between lighter
// (WIN-293, levelOf() in region-map.ts) and a legend, or – with no detailed map – the overview map with a
// numbered pin per place, or, when the region cannot be placed at all, its wines as a list. Blind wines that are not
// revealed (the database sends no origin for them) and wines without a region are left out, also from the counts and
// the order of the tabs. Also drawn on /superadmin/dev/maps/.
import { loadMap, mapIdFor, groupWines, markings, drawMap, labelScale, numberRanges } from './region-map';
import { placeOf, loadOverview, overviewFor, focusFor, drawOverview, detailFor, loadTowns, type Place } from './overview-map';
import { mapZoom } from './ui/map-zoom';
import { mk } from './ui/dom';
import { tabBar, tabs, selectTab, currentTab } from './ui/tabs';
import { countryName, normOrigin } from './origin';
import { setMapCredit, OVERVIEW_SOURCES } from './wine-map';
import { t } from '../i18n';

export type MapWine = { id: number; sort_order: number; name: string; region: string | null; appellation: string | null; appellation_id: string | null; country: string | null;
  producer: string | null; producer_lat?: number | null; producer_lon?: number | null; blind?: boolean | null };

/** The page's parts: the faint map behind the heading, the section (shown when there is a map), the map, legend and credit. */
export type OriginParts = { hero: HTMLElement; block: HTMLElement; box: HTMLElement; legend: HTMLElement; credit: HTMLElement };

/** One tab: a value of the wines' region field, its wines in the evening's order */
export type RegionTab = { key: string; name: string; wines: MapWine[] };

/** The tabs: one per region field (compared without case and accents), in the order of each region's first wine.
 *  Blind wines that are not revealed and wines without a region get none. */
export function regionTabs(wines: MapWine[]): RegionTab[] {
  const out = new Map<string, RegionTab>();
  for (const w of wines) {
    if (w.blind || !w.region?.trim()) continue;
    const key = normOrigin(w.region);
    const tab = out.get(key) ?? { key, name: w.region.trim(), wines: [] };
    tab.wines.push(w);
    out.set(key, tab);
  }
  return [...out.values()];
}

// Per section: its tab bar, the chosen tab and a counter so a slow drawing never replaces a newer one
type State = { bar: HTMLDivElement; tabs: RegionTab[]; all: MapWine[]; drawn: number };
const states = new WeakMap<HTMLElement, State>();

/** Draws (or redraws, after a blind wine is revealed) the section. The chosen tab is kept when it is still there. */
export async function showOrigins(wines: MapWine[], el: OriginParts) {
  const list = regionTabs(wines);
  let st = states.get(el.block);
  if (!st) {
    const bar = tabBar(t('map.regions'));
    bar.id = `${el.block.id || 'origin'}-tabs`;
    const head = el.block.querySelector(':scope > h2, :scope > h3');
    if (head) head.after(bar); else el.block.prepend(bar);
    st = { bar, tabs: [], all: [], drawn: 0 };
    states.set(el.block, st);
    const s = st;
    tabs(bar, { onChange: (key) => { const tab = s.tabs.find((x) => x.key === key); if (tab) void drawTab(tab, s, el); } });
  }
  const chosen = currentTab(st.bar);
  st.tabs = list;
  st.all = wines;
  if (!list.length) {
    // No wine with a region: as without wines
    st.drawn++;
    el.block.hidden = true;
    el.hero.innerHTML = '';
    return;
  }
  st.bar.replaceChildren(...tabBar('', list.map((r) => ({ id: r.key, label: r.name, count: r.wines.length }))).children);
  st.bar.hidden = list.length < 2;
  const open = list.find((r) => r.key === chosen) ?? list[0];
  if (list.length > 1) {
    for (const b of st.bar.querySelectorAll<HTMLElement>('[data-tab]')) b.id = `${st.bar.id}-${b.dataset.tab!.replace(/[^a-z0-9]+/g, '-')}`;
    el.box.setAttribute('role', 'tabpanel');
  } else el.box.removeAttribute('role');
  // Shown before the tab is chosen: the bar can only bring the chosen tab into view once it has a size
  el.block.hidden = false;
  selectTab(st.bar, open.key);
  // The faint map behind the heading: the first region with a detailed map
  await drawHero(list, el);
  await drawTab(open, st, el);
}

async function drawHero(list: RegionTab[], el: OriginParts) {
  for (const r of list) {
    const id = mapIdFor(r.name);
    const map = id ? await loadMap(id) : null;
    if (!map) continue;
    const { counts, wholeRegion } = markings(await groupWines(map, r.wines));
    el.hero.innerHTML = drawMap(map, { mode: 'background', counts, wholeRegion });
    return;
  }
  el.hero.innerHTML = '';
}

/** One region's map and legend. */
async function drawTab(tab: RegionTab, st: State, el: OriginParts) {
  const turn = ++st.drawn;
  const fresh = () => turn === st.drawn;
  // The wines' numbers in the evening count every wine, also the blind ones
  const no = new Map(st.all.map((w, i) => [w.id, i + 1]));
  const tabEl = st.bar.querySelector<HTMLElement>(`[data-tab="${CSS.escape(tab.key)}"]`);
  if (st.tabs.length > 1 && tabEl) el.box.setAttribute('aria-labelledby', tabEl.id); else el.box.removeAttribute('aria-labelledby');
  const id = mapIdFor(tab.name);
  const map = id ? await loadMap(id) : null;
  if (!fresh()) return;
  if (map) {
    const groups = await groupWines(map, tab.wines);
    if (!fresh()) return;
    // The whole region, every wine's lowest known area strongest and the levels between lighter (WIN-293)
    const marks = markings(groups);
    // Producers with an exact place get a pin (one per producer)
    const pins = [...new Map(tab.wines.filter((w) => w.producer_lat != null && w.producer_lon != null)
      .map((w) => [`${w.producer_lat},${w.producer_lon}`, { lon: w.producer_lon!, lat: w.producer_lat!, title: w.producer ?? '' }])).values()];
    el.box.hidden = false;
    // The same view on every screen: the whole region (it is not zoomed to the wines' areas)
    // Names and numbers drawn bigger on a narrow box, so the area's name can be read on a phone
    el.box.innerHTML = drawMap(map, { ...marks, pins, scale: labelScale(map, el.box.clientWidth) });
    mapZoom(el.box);
    // The legend: number of wines per area, the level between ("Médoc"), and their numbers in the evening
    el.legend.replaceChildren(...groups.map((g) => {
      const nums = t('map.wineNumbers', { list: numberRanges(g.wines.map((wid) => no.get(wid) ?? 0)) });
      const whole = t('map.wholeRegion', { region: map.name });
      // A wine with only the region: "Hele Bordeaux"; with an appellation that covers it: "Porto", "Hele Douro"
      if (g.whole && normOrigin(g.title) === normOrigin(map.name)) return legendItem('whole', g.count, whole, nums);
      const where = g.whole ? whole : g.level.midName && normOrigin(g.level.midName) !== normOrigin(g.title) ? g.level.midName : null;
      return legendItem(g.inMap ? 'in-map' : 'whole', g.count, g.title, [where, nums].filter(Boolean).join(' · '));
    }));
    el.credit.hidden = false;
    setMapCredit(el.box, map.sources, pins.length > 0, el.credit);
    return;
  }
  await drawOverviewTab(tab, no, el, fresh);
}

// No detailed map for the region: the overview map with a numbered pin per place; wines that cannot be placed (and a
// region with none placed) are listed by name, so no wine is left out
async function drawOverviewTab(tab: RegionTab, no: Map<number, number>, el: OriginParts, fresh: () => boolean) {
  const placed: { w: MapWine; p: Place | null }[] = await Promise.all(tab.wines.map(async (w) => ({ w, p: await placeOf(w) })));
  if (!fresh()) return;
  const groups = new Map<string, { p: Place; wines: MapWine[] }>();
  for (const { w, p } of placed) {
    if (!p) continue;
    const key = `${p.lon.toFixed(2)},${p.lat.toFixed(2)}`;
    const g = groups.get(key) ?? { p, wines: [] };
    g.wines.push(w);
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => b.wines.length - a.wines.length);
  const places = list.map((g) => g.p);
  const [ov, focus, towns] = places.length ? await Promise.all([loadOverview(overviewFor(places)), focusFor(places), loadTowns()]) : [null, null, null];
  // A small area (one country, an island): the detailed tiles, so Madeira is land under its pin
  const detail = focus ? await detailFor(focus) : null;
  if (!fresh()) return;
  const items: HTMLLIElement[] = [];
  if (ov) {
    const pins = list.map((g) => ({ lon: g.p.lon, lat: g.p.lat, n: g.wines.length, label: g.p.label }));
    el.box.hidden = false;
    el.box.innerHTML = drawOverview(ov, pins, focus, 'full', detail, towns);
    mapZoom(el.box);
    el.credit.hidden = false;
    setMapCredit(el.box, OVERVIEW_SOURCES, false, el.credit);
    items.push(...list.map((g) => {
      const where = [g.wines[0].region, countryName(g.p.country)].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
      const nums = t('map.wineNumbers', { list: numberRanges(g.wines.map((w) => no.get(w.id) ?? 0)) });
      return legendItem('in-map', g.wines.length, g.p.label, [where, nums].filter(Boolean).join(' · '));
    }));
  } else {
    // Nothing to draw: the region's name and its wines as a list
    el.box.hidden = true;
    el.box.replaceChildren();
    el.credit.hidden = true;
  }
  const unplaced = ov ? placed.filter((x) => !x.p).map((x) => x.w) : tab.wines;
  items.push(...unplaced.map((w) => {
    const where = [w.appellation, tab.name, countryName(w.country)].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
    const nums = t('map.wineNumbers', { list: String(no.get(w.id) ?? '') });
    return legendItem('other', 1, w.name, [where, nums].filter(Boolean).join(' · '));
  }));
  el.legend.replaceChildren(...items);
}

// One line of the map's legend (component 23): the number in a circle, the place (or wine), what it covers
function legendItem(kind: string, count: number, titleText: string, subText: string) {
  const li = mk('li', kind);
  const text = mk('span', 'txt');
  text.append(mk('b', '', titleText), mk('span', 'sub', subText));
  li.append(mk('span', 'no', String(count)), text);
  return li;
}
