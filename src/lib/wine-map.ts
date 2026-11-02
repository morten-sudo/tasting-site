// The small map for one wine: its appellation on the detailed region map when there is one,
// otherwise a pin on the overview map. Used on the guest's wine page and in the host's wine form.
import { loadMap, mapIdFor, drawMap, mapPoint } from './region-map';
import { placeOf, loadOverview, overviewFor, focusFor, drawOverview, type Place } from './overview-map';
import { loadAppellations, matchAppellation } from './origin';

export type WineOrigin = { appellation?: string | null; appellation_id?: string | null; region?: string | null; country?: string | null;
  producer?: string | null; producer_lat?: number | null; producer_lon?: number | null };
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
    // The producer's exact place as a pin on top of its appellation
    const pin = w.producer_lat != null && w.producer_lon != null && mapPoint(map, w.producer_lon, w.producer_lat)
      ? [{ lon: w.producer_lon, lat: w.producer_lat, title: w.producer ?? '' }] : [];
    const svg = drawMap(map, { mode: 'mini', counts: inMap ? new Map([[appellationId!, 1]]) : new Map(), wholeRegion: !inMap, pins: pin });
    // An appellation on the list that is not an area covers the whole region (e.g. Porto)
    // A pin may come from OpenStreetMap's address search, which asks to be credited where it is shown
    const credit = pin.length ? '<p class="map-credit">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></p>' : '';
    return { svg: svg + credit, how: pin.length ? 'producer' : inMap ? 'area' : appellationId ? 'regionWide' : 'region' };
  }
  const place = await placeOf({ ...w, appellation_id: appellationId });
  if (!place) return null;
  const [overview, focus] = await Promise.all([loadOverview(overviewFor([place])), focusFor([place], true)]);
  if (!overview) return null;
  const credit = place.how === 'producer' ? '<p class="map-credit">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></p>' : '';
  return { svg: drawOverview(overview, [{ lon: place.lon, lat: place.lat, label: place.label }], focus, 'mini') + credit, how: place.how };
}
