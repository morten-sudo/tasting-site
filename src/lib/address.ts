// Structured tasting address with Danish postal code → city lookup (static list in /data).

export type Address = { street: string | null; house_number: string | null; postal_code: string | null; city: string | null };

let postalCodes: Promise<Record<string, string>> | null = null;
function loadPostalCodes() {
  postalCodes ??= fetch('/data/postal-codes-dk.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return postalCodes;
}

const field = (prefix: string, name: string) => document.getElementById(`${prefix}-${name}`) as HTMLInputElement;
const val = (el: HTMLInputElement) => el.value.trim() || null;

/** Wires up the city lookup: four digits in the postal code fill in the city (still editable). */
export function initAddress(prefix: string) {
  const postal = field(prefix, 'postal');
  const city = field(prefix, 'city');
  let autoCity = '';
  postal.addEventListener('focus', loadPostalCodes, { once: true });
  postal.addEventListener('input', async () => {
    const code = postal.value.replace(/\s/g, '');
    if (!/^\d{4}$/.test(code)) return;
    const name = (await loadPostalCodes())[code];
    // Only replace the city if it is empty or was filled in by us
    if (name && (!city.value.trim() || city.value === autoCity)) { city.value = name; autoCity = name; }
  });
}

export function readAddress(prefix: string): Address {
  return {
    street: val(field(prefix, 'street')),
    house_number: val(field(prefix, 'number')),
    postal_code: field(prefix, 'postal').value.replace(/\s/g, '') || null,
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
}
