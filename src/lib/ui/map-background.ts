// Draws every faint background map (MapBackground.astro: <div class="hero-bg" data-map-bg="bourgogne">).
import { loadMap, drawMap } from '../region-map';

export async function fillMapBackgrounds(root: ParentNode = document) {
  await Promise.all([...root.querySelectorAll<HTMLElement>('[data-map-bg]')].map(async (box) => {
    const map = await loadMap(box.dataset.mapBg!);
    if (map) box.innerHTML = drawMap(map, { mode: 'background', wholeRegion: true });
  }));
}
