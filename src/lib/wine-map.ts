// The small map for one wine: its appellation on the detailed region map when there is one,
// otherwise a pin on the overview map. Used on the guest's wine page and in the host's wine form.
import { loadMap, mapIdFor, drawMap } from './region-map';
import { placeOf, loadOverview, overviewFor, focusFor, drawOverview, type Place } from './overview-map';
import { loadAppellations, matchAppellation } from './origin';

export type WineOrigin = { appellation?: string | null; appellation_id?: string | null; region?: string | null; country?: string | null };
/** How the wine was placed: an area of a detailed map, the whole region, or one of the overview's ways. */
export type MapHow = 'area' | 'regionWide' | 'region' | Place['how'];

/** The map as an SVG string and how the wine was placed, or null when not even the country is known. */
export async function wineMap(w: WineOrigin): Promise<{ svg: string; how: MapHow } | null> {
  // A typed appellation that is on the list counts as chosen (the database links it when saving)
  let appellationId = w.appellation_id ?? null;
  if (!appellationId && w.appellation) appellationId = matchAppellation(await loadAppellations(), w.appellation)?.id ?? null;
  const mapId = mapIdFor(w.region);
  const map = mapId ? await loadMap(mapId) : null;
  if (map) {
    const inMap = !!(appellationId && map.areas[appellationId]);
    const svg = drawMap(map, { mode: 'mini', counts: inMap ? new Map([[appellationId!, 1]]) : new Map(), wholeRegion: !inMap });
    // An appellation on the list that is not an area covers the whole region (e.g. Porto)
    return { svg, how: inMap ? 'area' : appellationId ? 'regionWide' : 'region' };
  }
  const place = await placeOf({ ...w, appellation_id: appellationId });
  if (!place) return null;
  const [overview, focus] = await Promise.all([loadOverview(overviewFor([place])), focusFor([place], true)]);
  if (!overview) return null;
  return { svg: drawOverview(overview, [{ lon: place.lon, lat: place.lat, label: place.label }], focus, 'mini'), how: place.how };
}
