// Shared by the Cloudflare Pages Functions in /functions: host check, the AI model and
// turning the model's answer into wine fields. Runs on Cloudflare, not in the browser.
import { SUPABASE_URL, SUPABASE_KEY } from '../lib/config';
import { bottleIn, validCl, withoutBottle } from '../lib/bottle';

export interface AiEnv {
  AI: { run: (model: string, input: unknown) => Promise<{ response?: string | object }> };
}

// Mistral Small 3.1: Apache 2.0 licence, reads text and images
export const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

export const STYLES = ['Red', 'WhiteWine', 'Rose', 'Orange', 'Sparkling', 'Sweet', 'Fortified', 'Other'];

export const FIELDS_SPEC = `"name": the wine's name (without the producer, unless it is the only name; without the vintage year, which goes in "vintage"; without the bottle size such as "Magnum", "75 cl" or "1,5 l", which goes in "bottle_cl"; drop shop marketing such as "95 points" or "top buy"),
"producer": the producer, winery, house or château,
"vintage": the year as 4 digits, "NV" for a non-vintage wine (e.g. most champagne, tawny or ruby port without a year), an age statement such as "10 years", or null when unknown,
"style": one of ${JSON.stringify(STYLES)} – "Fortified" for port, sherry, madeira, Rivesaltes and the like, "Sweet" for dessert wines such as Sauternes or Tokaji, "Other" for spirits and anything that is not wine,
"abv": alcohol percentage as a number, or null,
"appellation": the protected designation of origin as stated (e.g. "Saint-Émilion Grand Cru", "Pauillac", "Porto", "Rioja", "Barolo", "Chablis"), without classification words such as "Cru Classé" unless they are part of the name, or null,
"region": the wine region the appellation belongs to (e.g. "Bordeaux", "Douro", "Bourgogne", "Piemonte", "Toscana", "Mosel"; in the USA and Australia the state, e.g. "California", "South Australia"), or null,
"country": the country as a two-letter ISO 3166 code (e.g. "FR", "PT", "IT", "ES", "DE", "US"), or null,
"grapes": grape varieties as a comma-separated string, or null,
"bottle_cl": the bottle size in centilitres as a number (75 for an ordinary bottle, 37.5 for a half bottle, 50, 150 for a magnum, 300 for a double magnum or jeroboam), only when it is stated – e.g. "75 cl", "750 ml", "1,5 l", "Magnum" – otherwise null`;

export type WineFields = {
  name: string | null; producer: string | null; vintage: string | null; style: string | null;
  abv: number | null; appellation: string | null; region: string | null; country: string | null; grapes: string | null;
  /** The bottle size in centilitres when it is stated (else null: the wine keeps 75 cl) */
  bottle_cl: number | null;
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

/** "Château Fombrauge 2020" with vintage 2020 → "Château Fombrauge" (the year is shown from the vintage). */
export function withoutYear(name: string | null, vintage: string | null): string | null {
  if (!name || !vintage || !/^\d{4}$/.test(vintage)) return name;
  const cleaned = name.replace(new RegExp(`(^|[\\s,–—-]+)${vintage}(?=$|[\\s,–—-])`, 'g'), ' ')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,–—-]+|[\s,–—-]+$/g, '').trim();
  return cleaned.length >= 2 ? cleaned : name;
}

/** The model's answer → wine fields. `hints` (e.g. the page title) are searched for a year if the model gave none. */
export function toFields(answer: Record<string, unknown>, hints: string[] = []): WineFields {
  const abv = Number(String(answer.abv ?? '').replace(',', '.').replace('%', ''));
  const style = str(answer.style);
  const name = text(answer.name);
  const v = text(answer.vintage);
  const vintage = v && /^(n\.?\s?v\.?|non[- ]?vintage|sans ann[ée]e|sin añada|uden årgang)$/i.test(v) ? 'NV' : v;
  const year = vintage ?? yearIn(name, ...hints);
  // The size: what the name or the page's title says ("… Magnum", "1,5 l") before the model's answer;
  // the size words never stay in the name (the size is shown from bottle_cl)
  const said = Number(String(answer.bottle_cl ?? '').replace(',', '.'));
  const bottle = [name, ...hints].map(bottleIn).find((x) => x != null) ?? (validCl(said) ? Math.round(said * 10) / 10 : null);
  return {
    name: withoutBottle(withoutYear(name, year)),
    producer: text(answer.producer),
    vintage: year,
    style: style && STYLES.includes(style) ? style : null,
    abv: Number.isFinite(abv) && abv > 0 && abv < 80 ? abv : null,
    appellation: str(answer.appellation),
    region: str(answer.region),
    country: (() => { const c = str(answer.country)?.toUpperCase() ?? null; return c && /^[A-Z]{2}$/.test(c) ? c : null; })(),
    grapes: str(answer.grapes),
    bottle_cl: bottle,
  };
}

// ---------- Usage: every AI call and every email is counted for the superadmin's Usage page ----------
export type UsageFeature = 'label' | 'link' | 'name' | 'producer' | 'producer-address' | 'locate' | 'intro' | 'quiz'
  | 'login' | 'invite' | 'notify' | 'host-invite';

/** Writes one row through log_usage(); never fails the request it belongs to. */
export async function logUsage(request: Request | null, feature: UsageFeature,
  row: { model?: string; tokens_in?: number; tokens_out?: number; estimated?: boolean; n?: number } = {}) {
  const token = request?.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || SUPABASE_KEY;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_usage`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ feature, model: row.model ?? null, tokens_in: Math.round(row.tokens_in ?? 0),
        tokens_out: Math.round(row.tokens_out ?? 0), estimated: !!row.estimated, n: row.n ?? 1 }),
    });
  } catch { /* counting is not worth a failed request */ }
}

/** A wine read from a shop link: where its picture came from, or why there is none (the superadmin's Usage page).
 *  Never fails the request it belongs to. */
export type LinkOutcome = 'og' | 'jsonld' | 'shopify' | 'page' | 'none' | 'fetch_failed' | 'unreadable';
export async function logLinkRead(request: Request, url: string, outcome: LinkOutcome, images = 0, wineName: string | null = null) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_link_read`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url, outcome, images, wine_name: wineName }),
    });
  } catch { /* logging is not worth a failed request */ }
}

/** The model's own token count when it gives one; otherwise about 4 characters per token (and ~1500 for a picture). */
function tokensOf(input: unknown, out: unknown): { tokens_in: number; tokens_out: number; estimated: boolean } {
  const u = (out as { usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number } } | null)?.usage;
  const tin = u?.prompt_tokens ?? u?.input_tokens, tout = u?.completion_tokens ?? u?.output_tokens;
  if (typeof tin === 'number' && typeof tout === 'number') return { tokens_in: tin, tokens_out: tout, estimated: false };
  const text = JSON.stringify(input) ?? '';
  const images = (text.match(/data:image\//g) ?? []).length;
  const plain = text.replace(/data:image\/[^"]+/g, '');
  return { tokens_in: plain.length / 4 + images * 1500, tokens_out: (JSON.stringify(out) ?? '').length / 4, estimated: true };
}

/** env.AI with each call counted under a feature. */
export function meteredAi(env: AiEnv, request: Request, feature: UsageFeature): AiEnv['AI'] {
  return {
    run: async (model: string, input: unknown) => {
      const out = await env.AI.run(model, input);
      await logUsage(request, feature, { model, ...tokensOf(input, out) });
      return out;
    },
  };
}
