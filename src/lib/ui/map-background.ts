// The faint background maps (MapBackground.astro: <div class="hero-bg" data-map-bg="bourgogne">).
// fillMapBackgrounds(): a fixed region, the whole region lightly filled (the sign-up page).
// winesBackground(): the map of a tasting's wines, the same as behind the tasting's title (the dashboard's next tasting).
import { loadMap, drawMap, mainRegion, groupWines } from '../region-map';

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
