// Cloudflare Pages Function: POST /api/read-label
// Reads a wine label photo with a vision model in Cloudflare Workers AI and returns
// suggested fields for the admin wine form. Only signed-in hosts may call it.
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/lib/config';

interface Env {
  AI: { run: (model: string, input: unknown) => Promise<{ response?: string | object }> };
}

// Mistral Small 3.1: Apache 2.0 licence, reads images
const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
const MAX_IMAGE_CHARS = 2_000_000; // base64 data URI, ~1.5 MB image
const STYLES = ['Red', 'WhiteWine', 'Rose', 'Orange', 'Sparkling', 'Sweet', 'Fortified',
  'Vintage', 'Tawny', 'White', 'Rivesaltes', 'Aguardente'];

const PROMPT = `You read wine labels. Look at the photo and return ONLY a JSON object with these keys:
"name": the wine's name as printed (without the producer, unless it is the only name),
"producer": the producer, winery, house or château,
"vintage": the year as 4 digits, or an age statement such as "10 years", or null,
"style": one of ${JSON.stringify(STYLES)} – use "Vintage", "Tawny", "White" (white port), "Rivesaltes" or "Aguardente" only for those fortified styles; otherwise "Red", "WhiteWine", "Rose", "Orange", "Sparkling", "Sweet" or "Fortified",
"abv": alcohol percentage as a number, or null,
"region": region or appellation, or null,
"country": country, or null,
"grapes": grape varieties as a comma-separated string, or null.
Use only what you can read or clearly infer from the label. Use null when unsure. No other text.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function isHost(token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_host_id`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return false;
  const id = await res.json();
  return typeof id === 'string' && id.length > 0;
}

function parseAnswer(raw: string | object | undefined) {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  const text = String(raw ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !(await isHost(token))) return json({ error: 'not_host' }, 403);

  let image: string;
  try {
    ({ image } = (await request.json()) as { image: string });
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof image !== 'string' || !image.startsWith('data:image/') || image.length > MAX_IMAGE_CHARS) {
    return json({ error: 'bad_image' }, 400);
  }

  let answer: Record<string, unknown> | null = null;
  try {
    const out = await env.AI.run(MODEL, {
      messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: image } },
      ] }],
      max_tokens: 300,
      temperature: 0.1,
    });
    answer = parseAnswer(out.response);
  } catch {
    return json({ error: 'model_failed' }, 502);
  }
  if (!answer) return json({ error: 'unreadable' }, 422);

  const abv = Number(String(answer.abv ?? '').replace(',', '.').replace('%', ''));
  const style = str(answer.style);
  return json({
    name: str(answer.name),
    producer: str(answer.producer),
    vintage: str(answer.vintage),
    style: style && STYLES.includes(style) ? style : null,
    abv: Number.isFinite(abv) && abv > 0 && abv < 80 ? abv : null,
    region: str(answer.region),
    country: str(answer.country),
    grapes: str(answer.grapes),
  });
};
