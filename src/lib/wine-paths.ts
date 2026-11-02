// A wine's own address in the library, used everywhere a wine is linked to (never /admin/wines/<id>/).
import { wineSlug } from './wines';

// A wine's address: /admin/wines/<country>/<region>/<appellation>/<name>/<vintage>/
// (country in English so the address is the same in every language; empty parts are left out)
const COUNTRY_SLUG: Record<string, string> = { US: 'usa', GB: 'uk' };
const countrySlug = (code: string | null | undefined) => {
  if (!code) return null;
  if (COUNTRY_SLUG[code]) return COUNTRY_SLUG[code];
  try { return wineSlug(new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code); } catch { return code.toLowerCase(); }
};
export type PathWine = { id: number; name: string; vintage: string | null; country: string | null; region: string | null; appellation: string | null };

/** The address of every wine on the account; two wines that would share one get -2, -3 … on the name. */
export function winePaths(wines: PathWine[]): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();
  for (const w of [...wines].sort((a, b) => a.id - b.id)) {
    const year = w.vintage && /^\d{4}$/.test(w.vintage.trim()) ? w.vintage.trim() : null;
    const front = [countrySlug(w.country), w.region && wineSlug(w.region), w.appellation && wineSlug(w.appellation)].filter(Boolean);
    let name = wineSlug(w.name);
    const build = (n: string) => `/admin/wines/${[...front, n, year].filter(Boolean).join('/')}/`;
    for (let i = 2; used.has(build(name)); i++) name = `${wineSlug(w.name)}-${i}`;
    used.add(build(name));
    out.set(w.id, build(name));
  }
  return out;
}

