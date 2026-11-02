// A producer's postal address → its exact place on the map. Only an exact hit counts (a building, a house
// number or the estate itself); a street, a postcode or a town is not precise enough, and then there is no pin.
// France: the national address register (Base Adresse Nationale). Everywhere: OpenStreetMap's address search
// (Nominatim) – used sparingly (one lookup per producer, the result is saved) and credited on the maps.

export type GeoHit = { lat: number; lon: number; source: string };

const UA = 'Winetastr/1.0 (+https://winetastr.com; contact@winetastr.com)';

/** France: only a hit on the house number itself, with a good score. */
async function ban(address: string): Promise<GeoHit | null> {
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(address.slice(0, 200))}`,
      { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const f = ((await res.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: { type: string; score: number } }[] }).features?.[0];
    if (!f || f.properties.type !== 'housenumber' || f.properties.score < 0.6) return null;
    const [lon, lat] = f.geometry.coordinates;
    return { lat, lon, source: 'address (Base Adresse Nationale)' };
  } catch { return null; }
}

/** OpenStreetMap: only a building, a house number or a single place such as the winery (address rank 30). */
async function nominatim(address: string, country: string | null): Promise<GeoHit | null> {
  try {
    const q = new URLSearchParams({ q: address.slice(0, 250), format: 'jsonv2', limit: '1', addressdetails: '0' });
    if (country && /^[A-Z]{2}$/.test(country)) q.set('countrycodes', country.toLowerCase());
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`,
      { headers: { 'user-agent': UA, 'accept-language': 'en' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const hit = ((await res.json()) as { lat: string; lon: string; place_rank?: number; addresstype?: string }[])[0];
    if (!hit) return null;
    const exact = (hit.place_rank ?? 0) >= 30 || ['house', 'building'].includes(hit.addresstype ?? '');
    if (!exact) return null;
    const lat = Number(hit.lat), lon = Number(hit.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, source: 'address (OpenStreetMap)' } : null;
  } catch { return null; }
}

/** The exact place of an address, or null when no source places it precisely. */
export async function geocodeAddress(address: string, country: string | null): Promise<GeoHit | null> {
  const a = address.replace(/\s+/g, ' ').trim();
  if (a.length < 6) return null;
  if (country === 'FR' || /\bfrance\b/i.test(a)) {
    const hit = await ban(a);
    if (hit) return hit;
  }
  return nominatim(a, country);
}
