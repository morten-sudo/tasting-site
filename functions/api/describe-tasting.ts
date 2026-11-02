// Cloudflare Pages Function: POST /api/describe-tasting { tasting_id, lang? }
// Writes a draft introduction for a tasting with Cloudflare Workers AI, from the tasting's title and its wines.
// Read as the signed-in host, so only a host of the tasting gets a draft. The host edits it before saving.
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/lib/config';
import { MODEL, json, str, type AiEnv } from '../../src/server/wine-ai';

const LANGS: Record<string, string> = {
  da: 'Danish', en: 'English', is: 'Icelandic', fr: 'French', de: 'German', it: 'Italian', es: 'Spanish', nl: 'Dutch', pl: 'Polish',
};
type Wine = { name: string; producer: string | null; vintage: string | null; style: string | null; appellation: string | null;
  region: string | null; country: string | null; grapes: string | null; description: string | null };

export const onRequestPost = async ({ request, env }: { request: Request; env: AiEnv }) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_signed_in' }, 401);
  let body: { tasting_id?: unknown; lang?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const id = str(body.tasting_id) ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_request' }, 400);

  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` };
  const cols = 'name,producer,vintage,style,appellation,region,country,grapes,description';
  const [tRes, wRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/tastings?id=eq.${id}&select=title,language`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/tasting_wines?tasting_id=eq.${id}&select=sort_order,wines(${cols})&order=sort_order`, { headers }),
  ]);
  const tasting = ((tRes.ok ? await tRes.json() : []) as { title: string; language: string | null }[])[0];
  if (!tasting) return json({ error: 'not_found' }, 404);
  const wines = ((wRes.ok ? await wRes.json() : []) as { wines: Wine }[]).map((r) => r.wines).filter(Boolean);
  if (!wines.length) return json({ error: 'no_wines' }, 400);

  const lang = [str(body.lang), tasting.language].find((l) => l && LANGS[l]) ?? 'da';
  const list = wines.map((w, i) => `${i + 1}. ${[w.producer, w.name, w.vintage].filter(Boolean).join(' ')}`
    + ` – ${[w.style, w.appellation, w.region, w.country, w.grapes ? `grapes: ${w.grapes}` : null].filter(Boolean).join(', ')}`
    + (w.description ? ` – notes: ${w.description.slice(0, 300)}` : '')).join('\n');
  const prompt = `You write the introduction a host shows their guests on the invitation to a wine tasting.
Tasting: "${tasting.title}"
The wines, in the order they are poured:
${list}

Write the introduction in ${LANGS[lang]}: 2–3 short paragraphs, 80–140 words in all, warm and inviting but not over the top.
Say what the evening is about and how the wines lead from one to the next (regions, grapes, styles), from the first to the last.
Use only facts from the list – no scores, prices, dates, places or producers' stories that are not given. Do not list every wine.
Write to the guests ("we", "you"). Plain text only: no headings, no bullet points, no markdown, no greeting, no signature.`;

  try {
    const out = await env.AI.run(MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 500, temperature: 0.6 });
    const text = String(typeof out.response === 'string' ? out.response : '').replace(/\*\*/g, '').trim();
    if (!text) return json({ error: 'empty' }, 502);
    return json({ text, lang });
  } catch {
    return json({ error: 'model_failed' }, 502);
  }
};
