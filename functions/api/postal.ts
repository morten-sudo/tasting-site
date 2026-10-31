// Cloudflare Pages Function: GET /api/postal?country=DE&code=10115 → { city, region }
// Looks up the city for a postal code outside Denmark (Denmark uses a list in the site itself)
// through the free Zippopotam.us service. Answers are cached for a month at Cloudflare.

const COUNTRIES = new Set(['SE', 'NO', 'IS', 'FI', 'DE', 'AT', 'CH', 'NL', 'BE', 'LU', 'FR', 'IT', 'ES', 'PT', 'GB', 'PL', 'DK', 'US', 'CA']);

const json = (body: unknown, status = 200, cache = 'public, max-age=86400') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

/** The forms of the code the service may know it by, most specific first. */
export function candidates(country: string, code: string): string[] {
  const c = code.toUpperCase().trim();
  const list: string[] = [c];
  if (country === 'NL') list.unshift(c.slice(0, 4));                 // the service only has the four digits
  if (country === 'GB') list.unshift(c.split(' ')[0]);               // and only the outward code in the UK
  if (country === 'CA') list.unshift(c.slice(0, 3));                 // and the first three characters in Canada
  if (country === 'US') list.unshift(c.slice(0, 5));
  if (country === 'PT') list.push(c.slice(0, 4));
  if (country === 'SE') list.push(c.replace(/\s/g, ''));
  if (country === 'LU') list.push('L-' + c.replace(/^L-?/, ''));
  return [...new Set(list.filter(Boolean))];
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const country = (url.searchParams.get('country') ?? '').toUpperCase();
  const code = (url.searchParams.get('code') ?? '').trim();
  if (!COUNTRIES.has(country) || !/^[A-Za-z0-9 -]{2,10}$/.test(code)) return json({ error: 'bad_request' }, 400, 'no-store');

  for (const c of candidates(country, code)) {
    try {
      const res = await fetch(`https://api.zippopotam.us/${country.toLowerCase()}/${encodeURIComponent(c)}`, {
        signal: AbortSignal.timeout(5000),
        cf: { cacheTtl: 30 * 86400, cacheEverything: true },
      } as RequestInit);
      if (!res.ok) continue;
      const data = (await res.json()) as { places?: { 'place name'?: string; 'state abbreviation'?: string }[] };
      const places = data.places ?? [];
      const names = [...new Set(places.map((p) => p['place name']?.trim()).filter(Boolean))] as string[];
      // States and provinces matter in the USA and Canada
      const region = country === 'US' || country === 'CA' ? places[0]?.['state abbreviation']?.trim() || null : null;
      if (names.length) return json({ city: names[0], region, others: names.slice(1, 5) });
    } catch {}
  }
  return json({ city: null }, 404);
};
