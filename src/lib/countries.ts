// Countries for a tasting's address: the country's own name, how its postal codes look,
// and how an address is written there (number before or after the street, city before or after the code).
// The same rules are used by the database trigger that composes the one-line address (compose_tasting_place).

export type Country = {
  code: string;            // ISO 3166-1 alpha-2
  name: string;            // the country's own name, shown to guests of every language
  example: string;         // a postal code in the right format (placeholder)
  pattern: RegExp;         // a valid, normalised postal code
  numeric: boolean;        // only digits → numeric keyboard on phones
  normalise?: (raw: string) => string;
  regions?: [string, string][];   // states / provinces (code, name) where the address needs one
};

const US_STATES: [string, string][] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
  ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
  ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['PR', 'Puerto Rico'],
];
const CA_PROVINCES: [string, string][] = [
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'], ['NU', 'Nunavut'],
  ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Québec'], ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
];

const digits = (n: number) => new RegExp(`^\\d{${n}}$`);
const upper = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();

export const COUNTRIES: Country[] = [
  { code: 'DK', name: 'Danmark', example: '2840', pattern: digits(4), numeric: true },
  { code: 'SE', name: 'Sverige', example: '114 51', pattern: /^\d{3} \d{2}$/, numeric: true,
    normalise: (s) => s.replace(/\D/g, '').replace(/^(\d{3})(\d{2})$/, '$1 $2') },
  { code: 'NO', name: 'Norge', example: '0150', pattern: digits(4), numeric: true },
  { code: 'IS', name: 'Ísland', example: '101', pattern: digits(3), numeric: true },
  { code: 'FI', name: 'Suomi', example: '00100', pattern: digits(5), numeric: true },
  { code: 'DE', name: 'Deutschland', example: '10115', pattern: digits(5), numeric: true },
  { code: 'AT', name: 'Österreich', example: '1010', pattern: digits(4), numeric: true },
  { code: 'CH', name: 'Schweiz', example: '8001', pattern: digits(4), numeric: true },
  { code: 'NL', name: 'Nederland', example: '1012 AB', pattern: /^\d{4} [A-Z]{2}$/, numeric: false,
    normalise: (s) => upper(s).replace(/^(\d{4})\s?([A-Z]{2})$/, '$1 $2') },
  { code: 'BE', name: 'België / Belgique', example: '1000', pattern: digits(4), numeric: true },
  { code: 'LU', name: 'Luxembourg', example: '1009', pattern: digits(4), numeric: true,
    normalise: (s) => s.replace(/^L-?/i, '') },
  { code: 'FR', name: 'France', example: '75001', pattern: digits(5), numeric: true },
  { code: 'IT', name: 'Italia', example: '00184', pattern: digits(5), numeric: true },
  { code: 'ES', name: 'España', example: '28013', pattern: digits(5), numeric: true },
  { code: 'PT', name: 'Portugal', example: '1100-148', pattern: /^\d{4}-\d{3}$/, numeric: true,
    normalise: (s) => s.replace(/\D/g, '').replace(/^(\d{4})(\d{3})$/, '$1-$2') },
  { code: 'GB', name: 'United Kingdom', example: 'SW1A 1AA', pattern: /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/, numeric: false,
    normalise: (s) => upper(s).replace(/\s/g, '').replace(/^(.+)(\d[A-Z]{2})$/, '$1 $2') },
  { code: 'US', name: 'United States', example: '10001', pattern: /^\d{5}(-\d{4})?$/, numeric: true,
    normalise: (s) => s.replace(/[^\d-]/g, '').replace(/^(\d{5})(\d{4})$/, '$1-$2'), regions: US_STATES },
  { code: 'CA', name: 'Canada', example: 'M5V 2T6', pattern: /^[A-Z]\d[A-Z] \d[A-Z]\d$/, numeric: false,
    normalise: (s) => upper(s).replace(/\s/g, '').replace(/^(.{3})(.{3})$/, '$1 $2'), regions: CA_PROVINCES },
  { code: 'PL', name: 'Polska', example: '00-950', pattern: /^\d{2}-\d{3}$/, numeric: true,
    normalise: (s) => s.replace(/\D/g, '').replace(/^(\d{2})(\d{3})$/, '$1-$2') },
];

export const DEFAULT_COUNTRY = 'DK';
export const countryBy = (code: string | null | undefined) =>
  COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

/** Tidies a postal code into the country's format (spaces, dashes, capitals). */
export function normalisePostal(country: Country, raw: string) {
  const s = raw.trim();
  return country.normalise ? country.normalise(s) : s.replace(/\s+/g, '');
}
