// A producer's postal address → its exact place on the map. Only an exact hit counts (a building, a house
// number or the estate itself); a street, a postcode or a town is not precise enough, and then there is no pin.
// France: the national address register (Base Adresse Nationale). Everywhere: OpenStreetMap's address search
// (Nominatim) – used sparingly (one lookup per producer, the result is saved) and credited on the maps.

export type GeoHit = { lat: number; lon: number; source: string };
/** What each source answered, for checking why an address was not placed. */
export type GeoTry = { source: string; query: string; result: string };

const UA = 'Winetastr/1.0 (+https://winetastr.com; contact@winetastr.com)';

/** France: only a hit on the house number itself, with a good score. */
async function ban(address: string, tries: GeoTry[]): Promise<GeoHit | null> {
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(address.slice(0, 200))}`,
      { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) { tries.push({ source: 'BAN', query: address, result: `http ${res.status}` }); return null; }
    const f = ((await res.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: { type: string; score: number; label: string } }[] }).features?.[0];
    if (!f) { tries.push({ source: 'BAN', query: address, result: 'no hit' }); return null; }
    tries.push({ source: 'BAN', query: address, result: `${f.properties.type} ${f.properties.score.toFixed(2)} ${f.properties.label}` });
    if (f.properties.type !== 'housenumber' || f.properties.score < 0.6) return null;
    const [lon, lat] = f.geometry.coordinates;
    return { lat, lon, source: 'address (Base Adresse Nationale)' };
  } catch (e) { tries.push({ source: 'BAN', query: address, result: `error ${String(e).slice(0, 80)}` }); return null; }
}

/** OpenStreetMap: only a building, a house number or a single place such as the winery (address rank 30). */
async function nominatim(address: string, country: string | null, tries: GeoTry[]): Promise<GeoHit | null> {
  try {
    const q = new URLSearchParams({ q: address.slice(0, 250), format: 'jsonv2', limit: '1', addressdetails: '0' });
    if (country && /^[A-Z]{2}$/.test(country)) q.set('countrycodes', country.toLowerCase());
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`,
      { headers: { 'user-agent': UA, 'accept-language': 'en' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { tries.push({ source: 'OpenStreetMap', query: address, result: `http ${res.status}` }); return null; }
    const hit = ((await res.json()) as { lat: string; lon: string; place_rank?: number; addresstype?: string; display_name?: string }[])[0];
    if (!hit) { tries.push({ source: 'OpenStreetMap', query: address, result: 'no hit' }); return null; }
    tries.push({ source: 'OpenStreetMap', query: address, result: `${hit.addresstype} rank ${hit.place_rank} ${hit.display_name?.slice(0, 120)}` });
    const exact = (hit.place_rank ?? 0) >= 30 || ['house', 'building'].includes(hit.addresstype ?? '');
    if (!exact) return null;
    const lat = Number(hit.lat), lon = Number(hit.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, source: 'address (OpenStreetMap)' } : null;
  } catch (e) { tries.push({ source: 'OpenStreetMap', query: address, result: `error ${String(e).slice(0, 80)}` }); return null; }
}

/** The address as written, and a cleaner form: no country, no province codes in brackets, no "Fraz./Loc." parts,
 *  "3, Place …" → "3 Place …". Registers find the cleaner form more often. */
function variants(address: string) {
  const a = address.replace(/\s+/g, ' ').trim();
  const clean = a
    .replace(/\((?:[A-Z]{2}|[^)]{1,30})\)/g, ' ')
    .replace(/,?\s*(france|italia|italy|españa|spain|portugal|deutschland|germany|österreich|austria|united states|usa|u\.s\.a\.)\s*\.?$/i, '')
    .replace(/(^|[\s,])(fraz\.?|frazione|loc\.?|località|localita|lieu-dit|lieu dit)\s+[A-Za-zÀ-ÿ'’-]+(\s+[A-Z][a-zà-ÿ'’-]+)?/gi, '$1')
    .replace(/^(\d+[a-z]?)\s*,\s*/i, '$1 ')
    .replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').replace(/^,\s*|,\s*$/g, '').trim();
  return [...new Set([a, clean].filter((x) => x.length >= 6))];
}

/** The exact place of an address, or null when no source places it precisely. */
export async function geocodeAddress(address: string, country: string | null, tries: GeoTry[] = []): Promise<GeoHit | null> {
  const forms = variants(address);
  if (!forms.length) return null;
  if (country === 'FR' || /\bfrance\b/i.test(address)) {
    for (const f of forms) {
      const hit = await ban(f, tries);
      if (hit) return hit;
    }
  }
  for (const [i, f] of forms.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 1100)); // OpenStreetMap: at most one lookup a second
    const hit = await nominatim(f, country, tries);
    if (hit) return hit;
  }
  return null;
}
