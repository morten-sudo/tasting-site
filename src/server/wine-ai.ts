// Shared by the Cloudflare Pages Functions in /functions: host check, the AI model and
// turning the model's answer into wine fields. Runs on Cloudflare, not in the browser.
import { SUPABASE_URL, SUPABASE_KEY } from '../lib/config';

export interface AiEnv {
  AI: { run: (model: string, input: unknown) => Promise<{ response?: string | object }> };
}

// Mistral Small 3.1: Apache 2.0 licence, reads text and images
export const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

export const STYLES = ['Red', 'WhiteWine', 'Rose', 'Orange', 'Sparkling', 'Sweet', 'Fortified',
  'Vintage', 'Tawny', 'White', 'Rivesaltes', 'Aguardente'];

export const FIELDS_SPEC = `"name": the wine's name (without the producer, unless it is the only name; drop shop marketing such as "95 points" or "top buy"),
"producer": the producer, winery, house or château,
"vintage": the year as 4 digits, or an age statement such as "10 years", or null,
"style": one of ${JSON.stringify(STYLES)} – use "Vintage", "Tawny", "White" (white port), "Rivesaltes" or "Aguardente" only for those fortified styles; otherwise "Red", "WhiteWine", "Rose", "Orange", "Sparkling", "Sweet" or "Fortified",
"abv": alcohol percentage as a number, or null,
"region": region or appellation, or null,
"country": country, or null,
"grapes": grape varieties as a comma-separated string, or null`;

export type WineFields = {
  name: string | null; producer: string | null; vintage: string | null; style: string | null;
  abv: number | null; region: string | null; country: string | null; grapes: string | null;
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** True when the bearer token belongs to a signed-in host (checked against Supabase). */
export async function isHost(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_host_id`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return false;
  const id = await res.json();
  return typeof id === 'string' && id.length > 0;
}

export function parseAnswer(raw: string | object | undefined) {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  const text = String(raw ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

export const str = (v: unknown) =>
  (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null);

/** Text or number → trimmed text (models sometimes answer 2017 instead of "2017"). */
const text = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : str(v));

/** A plausible vintage year (1900 – next year) in a piece of text, e.g. "Vintage Port 2017". */
export function yearIn(...texts: (string | null | undefined)[]) {
  const max = new Date().getFullYear() + 1;
  for (const t of texts) {
    for (const m of (t ?? '').matchAll(/\b(19\d{2}|20\d{2})\b/g)) {
      const y = Number(m[1]);
      if (y >= 1900 && y <= max) return m[1];
    }
  }
  return null;
}

/** The model's answer → wine fields. `hints` (e.g. the page title) are searched for a year if the model gave none. */
export function toFields(answer: Record<string, unknown>, hints: string[] = []): WineFields {
  const abv = Number(String(answer.abv ?? '').replace(',', '.').replace('%', ''));
  const style = str(answer.style);
  const name = text(answer.name);
  return {
    name,
    producer: text(answer.producer),
    vintage: text(answer.vintage) ?? yearIn(name, ...hints),
    style: style && STYLES.includes(style) ? style : null,
    abv: Number.isFinite(abv) && abv > 0 && abv < 80 ? abv : null,
    region: str(answer.region),
    country: str(answer.country),
    grapes: str(answer.grapes),
  };
}
