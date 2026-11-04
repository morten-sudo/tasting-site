// The small map for one wine: its appellation on the detailed region map when there is one,
// otherwise a pin on the overview map. Used on the guest's wine page and in the host's wine form.
import { loadMap, mapIdFor, drawMap, mapPoint } from './region-map';
import { placeOf, loadOverview, loadDetail, loadTowns, overviewFor, focusFor, drawOverview, type Place } from './overview-map';
import { loadAppellations, matchAppellation } from './origin';
import { t } from '../i18n';

export type WineOrigin = { appellation?: string | null; appellation_id?: string | null; region?: string | null; country?: string | null;
  producer?: string | null; producer_lat?: number | null; producer_lon?: number | null };
/** How the wine was placed: an area of a detailed map, the whole region, or one of the overview's ways. */
export type MapHow = 'area' | 'regionWide' | 'region' | Place['how'];

/** The map as an SVG string and how the wine was placed, or null when not even the country is known. */
export async function wineMap(w: WineOrigin, opts: { towns?: boolean } = { towns: true }): Promise<{ svg: string; how: MapHow; sources: string } | null> {
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
    // The same map as the tasting's: the wine's appellation filled and named (no number), or the whole region lit
    const name = inMap ? map.areas[appellationId!].title ?? w.appellation ?? '' : '';
    const svg = drawMap(map, { counts: inMap ? new Map([[appellationId!, 1]]) : new Map(), titles: inMap && name ? new Map([[appellationId!, name]]) : new Map(),
      badges: false, wholeRegion: !inMap, pins: pin });
    // An appellation on the list that is not an area covers the whole region (e.g. Porto)
    return { svg, how: pin.length ? 'producer' : inMap ? 'area' : appellationId ? 'regionWide' : 'region', sources: map.sources };
  }
  const place = await placeOf({ ...w, appellation_id: appellationId });
  if (!place) return null;
  const [overview, focus] = await Promise.all([loadOverview(overviewFor([place])), focusFor([place], true)]);
  if (!overview) return null;
  // Zoomed in on a small area: the detailed tiles instead of the coarse overview
  const small = focus.lon1 - focus.lon0 < 20 && focus.lat1 - focus.lat0 < 14;
  const margin = Math.max(focus.lon1 - focus.lon0, focus.lat1 - focus.lat0) * 0.35;
  const detail = small ? await loadDetail({ lon0: focus.lon0 - margin, lat0: focus.lat0 - margin, lon1: focus.lon1 + margin, lat1: focus.lat1 + margin }) : null;
  // Towns for orientation, as on the detailed region maps
  const towns = opts.towns ? await loadTowns() : null;
  return { svg: drawOverview(overview, [{ lon: place.lon, lat: place.lat, label: place.label }], focus, 'full', detail, towns), how: place.how, sources: OVERVIEW_SOURCES };
}

/** Where the overview maps come from */
export const OVERVIEW_SOURCES = 'Natural Earth';

/** The one credit line under a map (component 23): "Map: Natural Earth; DGT (CAOP)", and "© OpenStreetMap" when a
 *  producer's pin came from its address search (it asks to be credited where it is shown). Just below the map, at the
 *  right; `line` is a <p class="map-credit"> in the page, else the one after the map is used (made when missing). */
export function setMapCredit(map: HTMLElement, sources: string | null, osm = false, line?: HTMLElement | null) {
  let p = line ?? (map.nextElementSibling as HTMLElement | null);
  if (!p?.classList.contains('map-credit')) {
    p = document.createElement('p');
    p.className = 'map-credit';
    map.after(p);
  }
  p.replaceChildren();
  if (sources) p.append(t('map.source', { sources }));
  if (osm) {
    const a = Object.assign(document.createElement('a'), { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener', textContent: 'OpenStreetMap' });
    p.append(sources ? '; © ' : '© ', a);
  }
  p.hidden = map.hidden || (!sources && !osm);
}

/** The credit for a wine's own map (wineMap()) */
export const showMapCredit = (map: HTMLElement, m: { how: MapHow; sources: string } | null | undefined) =>
  setMapCredit(map, m?.sources ?? null, m?.how === 'producer');
