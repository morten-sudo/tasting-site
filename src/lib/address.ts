// Structured tasting address: country, street, number, postal code and city.
// A complete postal code looks up the city – Denmark from a list in the site, other countries
// through /api/postal – and the code is tidied into the country's format.
import { t } from '../i18n';
import { countryBy, normalisePostal, DEFAULT_COUNTRY } from './countries';

export type Address = {
  country: string; street: string | null; house_number: string | null; postal_code: string | null; city: string | null;
};

let dkCodes: Promise<Record<string, string>> | null = null;
function loadDk() {
  dkCodes ??= fetch('/data/postal-codes-dk.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return dkCodes;
}
const cache = new Map<string, Promise<string | null>>();
function lookupCity(country: string, code: string): Promise<string | null> {
  if (country === 'DK') return loadDk().then((m) => m[code] ?? null);
  const key = `${country}:${code}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(`/api/postal?country=${country}&code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => (d?.city as string) ?? null).catch(() => null));
  }
  return cache.get(key)!;
}

const field = (prefix: string, name: string) => document.getElementById(`${prefix}-${name}`) as HTMLInputElement;
const val = (el: HTMLInputElement) => el.value.trim() || null;

/** Wires up the country choice, postal code format and city lookup. */
export function initAddress(prefix: string) {
  const country = field(prefix, 'country') as unknown as HTMLSelectElement;
  const postal = field(prefix, 'postal');
  const city = field(prefix, 'city');
  const hint = document.getElementById(`${prefix}-postal-hint`)!;
  let autoCity = '';
  let lastLookup = '';

  const setHint = (text = '') => { hint.textContent = text; hint.hidden = !text; };

  function applyCountry() {
    const c = countryBy(country.value);
    postal.placeholder = c.example;
    postal.inputMode = c.numeric ? 'numeric' : 'text';
    setHint();
  }

  async function check(final: boolean) {
    const c = countryBy(country.value);
    const raw = postal.value;
    if (!raw.trim()) { setHint(); return; }
    const code = normalisePostal(c, raw);
    if (!c.pattern.test(code)) {
      // Only complain once the host has left the field
      if (final) setHint(t('address.postalFormat', { example: c.example }));
      return;
    }
    if (final && code !== raw) postal.value = code;
    setHint();
    const key = `${c.code}:${code}`;
    if (key === lastLookup) return;
    lastLookup = key;
    const name = await lookupCity(c.code, code);
    if (lastLookup !== key) return;                 // a newer code was typed meanwhile
    // Only replace the city if it is empty or was filled in by us
    if (name && (!city.value.trim() || city.value === autoCity)) { city.value = name; autoCity = name; }
  }

  country.addEventListener('change', () => { applyCountry(); lastLookup = ''; check(true); });
  postal.addEventListener('focus', () => { if (country.value === 'DK') loadDk(); });
  postal.addEventListener('input', () => check(false));
  postal.addEventListener('change', () => check(true));
  applyCountry();
}

export function readAddress(prefix: string): Address {
  const c = countryBy(field(prefix, 'country').value);
  const raw = field(prefix, 'postal').value;
  return {
    country: c.code,
    street: val(field(prefix, 'street')),
    house_number: val(field(prefix, 'number')),
    postal_code: raw.trim() ? normalisePostal(c, raw) : null,
    city: val(field(prefix, 'city')),
  };
}

/** Fills the fields. An older one-line place without parts goes into the street field so nothing is lost. */
export function writeAddress(prefix: string, a: Partial<Address> & { place?: string | null }) {
  const hasParts = a.street || a.house_number || a.postal_code || a.city;
  field(prefix, 'street').value = (hasParts ? a.street : a.place) ?? '';
  field(prefix, 'number').value = a.house_number ?? '';
  field(prefix, 'postal').value = a.postal_code ?? '';
  field(prefix, 'city').value = a.city ?? '';
  const country = field(prefix, 'country') as unknown as HTMLSelectElement;
  country.value = countryBy(a.country ?? DEFAULT_COUNTRY).code;
  country.dispatchEvent(new Event('change'));   // placeholder and keyboard for the country
}
