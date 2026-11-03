// The faint background maps (MapBackground.astro: <div class="hero-bg" data-map-bg="bourgogne">).
// fillMapBackgrounds(): a fixed region, the whole region lightly filled (the sign-up page).
// winesBackground(): the map of a tasting's wines, the same as behind the tasting's title (the dashboard's next tasting).
import { loadMap, drawMap, mainRegion, groupWines, DETAILED_MAPS } from '../region-map';

export async function fillMapBackgrounds(root: ParentNode = document) {
  await Promise.all([...root.querySelectorAll<HTMLElement>('[data-map-bg]')].map(async (box) => {
    const map = await loadMap(box.dataset.mapBg!);
    if (map) box.innerHTML = drawMap(map, { mode: 'background', wholeRegion: true });
  }));
}

type W = { id: number; region: string | null; appellation: string | null; appellation_id: string | null };
/** Draws the wines' main region into box; empty when no wine comes from a region with a map.
 *  corner: the whole map in the box's lower right corner, as behind a card. */
export async function winesBackground(box: HTMLElement, wines: W[], corner = false) {
  const region = mainRegion(wines);
  const map = region ? await loadMap(region) : null;
  if (!map) { box.replaceChildren(); return; }
  const groups = await groupWines(map, wines);
  const counts = new Map(groups.filter((g) => g.inMap).map((g) => [g.key, g.count]));
  box.innerHTML = drawMap(map, { mode: 'background', counts, wholeRegion: groups.some((g) => g.whole) && !counts.size });
  if (corner) box.querySelector('svg')?.setAttribute('preserveAspectRatio', 'xMaxYMax meet');
}

/** Every page (Base.astro): a faint region map in the top right corner – picked from the page's address, so a page
 *  always gets the same one and pages differ. Left out where the page has a map of its own already behind its heading, or the
 *  cellar photo. */
export async function pageBackground(box: HTMLElement) {
  // A map inside a card (the overview's next tasting) does not count: the page still gets its own
  if (document.querySelector('.hero-bg:not(.page-bg):not(.card > .hero-bg), .hero')) return;
  // The tasting's own pages share one address pattern (/t/<slug>/…): the part after the slug picks the map
  const path = location.pathname.replace(/^\/t\/[^/]+/, '/t').replace(/\/(\d+|[0-9a-f-]{36})\/?$/, '/:id/');
  let h = 0;
  for (const c of path) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const id = DETAILED_MAPS[h % DETAILED_MAPS.length].id;
  const map = await loadMap(id);
  if (map) box.innerHTML = drawMap(map, { mode: 'background', wholeRegion: true });
}
