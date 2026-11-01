// Where a wine comes from: country (ISO code), region and appellation.
// The database matches free text against a shared list of appellations when a wine is saved;
// the same matching runs here so the host sees straight away whether an appellation is known.
import { supabase } from './supabase';
import { lang } from '../i18n';

export type Appellation = { id: string; name: string; region: string; country: string; subregion?: string | null; aliases: string[]; lat?: number | null; lon?: number | null };
export type WineRegion = { id: string; name: string; country: string; aliases: string[]; lat: number | null; lon: number | null };

// Countries offered in the wine form (ISO 3166-1 alpha-2); names come from the browser in the page's language
export const WINE_COUNTRIES = ['FR', 'IT', 'ES', 'PT', 'DE', 'AT', 'CH', 'HU', 'GR', 'SI', 'HR', 'RO', 'BG', 'GE',
  'LB', 'IL', 'US', 'CA', 'MX', 'AR', 'CL', 'UY', 'BR', 'ZA', 'AU', 'NZ', 'GB', 'DK', 'SE', 'CN', 'JP'];

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try { return new Intl.DisplayNames([lang()], { type: 'region' }).of(code) ?? code; } catch { return code; }
}

/** Lower case, no accents or punctuation, "st"/"ste" written out – the same as norm_origin() in the database. */
export function normOrigin(t: string | null | undefined): string {
  const plain = (t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o').replace(/ß/g, 's').replace(/[^a-z0-9]+/g, ' ');
  return ` ${plain} `.replace(/ st /g, ' saint ').replace(/ ste /g, ' sainte ').replace(/\s+/g, ' ').trim();
}

let cache: Promise<Appellation[]> | null = null;
export function loadAppellations(): Promise<Appellation[]> {
  cache ??= Promise.resolve(supabase.from('appellations').select('*').order('name'))
    .then(({ data }) => (data ?? []) as Appellation[]);
  return cache;
}

let regionCache: Promise<WineRegion[]> | null = null;
/** The wine regions of each country (with a centre for the maps). */
export function loadRegions(): Promise<WineRegion[]> {
  regionCache ??= Promise.resolve(supabase.from('wine_regions').select('id, name, country, aliases, lat, lon').order('name'))
    .then(({ data }) => (data ?? []) as WineRegion[]);
  return regionCache;
}

/** The known region a piece of text names (its name or an alias), optionally within one country. */
export function matchRegion(list: WineRegion[], text: string | null | undefined, country?: string | null): WineRegion | null {
  const n = normOrigin(text);
  if (!n) return null;
  return list.find((r) => (!country || r.country === country)
    && [r.name, ...r.aliases].some((x) => normOrigin(x) === n)) ?? null;
}

/** The known appellation in a piece of text: the longest name or alias it contains. */
export function matchAppellation(list: Appellation[], text: string | null | undefined): Appellation | null {
  const hay = ` ${normOrigin(text)} `;
  if (hay.trim() === '') return null;
  let best: Appellation | null = null;
  let bestLen = 0;
  for (const a of list) {
    for (const name of [a.name, ...a.aliases]) {
      const n = normOrigin(name);
      if (n && n.length > bestLen && hay.includes(` ${n} `)) { best = a; bestLen = n.length; }
    }
  }
  return best;
}

type Origin = { appellation?: string | null; region?: string | null; country?: string | null };

/** "Saint-Émilion Grand Cru · Bordeaux", "Porto · Douro", "Bordeaux" – or the country when nothing else is known. */
export function originLine(w: Origin): string | null {
  const parts: string[] = [];
  for (const p of [w.appellation, w.region]) {
    if (p && !parts.some((x) => normOrigin(x) === normOrigin(p))) parts.push(p);
  }
  if (!parts.length) return countryName(w.country);
  return parts.join(' · ');
}

/** The full origin for the wine page: "Saint-Émilion Grand Cru, Bordeaux, Frankrig". */
export function originFull(w: Origin): string | null {
  const parts: string[] = [];
  for (const p of [w.appellation, w.region, countryName(w.country)]) {
    if (p && !parts.some((x) => normOrigin(x) === normOrigin(p))) parts.push(p);
  }
  return parts.length ? parts.join(', ') : null;
}
