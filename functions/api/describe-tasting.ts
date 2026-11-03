// Cloudflare Pages Function: POST /api/describe-tasting { tasting_id, lang? }
// Writes a draft introduction for a tasting with Cloudflare Workers AI, from the tasting's title and its wines.
// Read as the signed-in host, so only a host of the tasting gets a draft. The host edits it before saving.
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/lib/config';
import { MODEL, json, str, type AiEnv, meteredAi, overDailyLimit } from '../../src/server/wine-ai';

const LANGS: Record<string, string> = {
  da: 'Danish', en: 'English', is: 'Icelandic', fr: 'French', de: 'German', it: 'Italian', es: 'Spanish', nl: 'Dutch', pl: 'Polish',
};
type Wine = { name: string; producer: string | null; vintage: string | null; style: string | null; appellation: string | null;
  region: string | null; country: string | null; grapes: string | null; description: string | null };
type Row = { blind: boolean; revealed: boolean; wines: Wine };
// gpt-oss-120b writes the best Danish of the Workers AI models we tried; the others can still be tried side by side
const WRITER = '@cf/openai/gpt-oss-120b';
const MODELS = [WRITER, MODEL, '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];

/** The text of the answer, whichever shape the model gives it in */
function answerText(out: Record<string, unknown>): string {
  if (typeof out.response === 'string') return out.response;
  const choices = out.choices as { message?: { content?: string } }[] | undefined;
  if (choices?.[0]?.message?.content) return choices[0].message.content;
  const output = out.output as { type?: string; content?: { type?: string; text?: string }[] }[] | undefined;
  const msg = output?.find((o) => o.type === 'message');
  return msg?.content?.map((c) => c.text ?? '').join('') ?? '';
}

const norm = (s: string | null) => (s ?? '').trim().toLowerCase();
const distinct = (xs: (string | null)[]) => [...new Set(xs.map(norm).filter(Boolean))];
const firstGrape = (g: string | null) => norm(g?.split(/[,/&+]| og | and /)[0] ?? null);

/** What kind of tasting it is, from the wines – and what the introduction should do about it */
function shapeOf(all: Wine[]): string[] {
  const out: string[] = [];
  // A single wine from another country than all the rest (e.g. one Californian among Bordeaux) is a welcome or a
  // contrast: the theme is found from the others
  const allCountries = distinct(all.map((w) => w.country));
  const odd = all.length >= 4 && allCountries.length === 2
    ? all.filter((w) => w.country && all.filter((x) => norm(x.country) === norm(w.country)).length === 1) : [];
  const wines = odd.length === 1 ? all.filter((w) => w !== odd[0]) : all;
  if (odd.length === 1) {
    out.push(`One wine stands apart from the rest (${[odd[0].name, odd[0].region ?? odd[0].country].filter(Boolean).join(', ')}). Present it as a deliberate welcome or contrast – the theme of the evening comes from the other wines.`);
  }
  const countries = distinct(wines.map((w) => w.country));
  const regions = distinct(wines.map((w) => w.region));
  const apps = distinct(wines.map((w) => w.appellation));
  const styles = distinct(all.map((w) => w.style));
  const grapes = distinct(wines.map((w) => firstGrape(w.grapes)));
  const names = distinct(wines.map((w) => `${w.producer ?? ''} ${w.name}`));
  const vintages = distinct(wines.map((w) => w.vintage));
  if (wines.length >= 3 && names.length === 1 && vintages.length > 1) {
    out.push('It is a VERTICAL tasting: the same wine in several vintages. Talk about how a wine changes with age and how the years differ; do not compare regions.');
  } else if (countries.length === 1 && regions.length === 1) {
    out.push(`The wines come from ONE region (${wines.find((w) => w.region)?.region}). Make it a journey inside that region`
      + (apps.length > 1 ? ' – from appellation to appellation (e.g. bank to bank, village to village) –' : '')
      + ' and say what makes the region special and how the wines differ within it.');
  } else if (countries.length === 1 && regions.length > 1) {
    out.push(`The wines come from ${regions.length} regions of ONE country. Make it a tour of the country: what the regions have in common and how they differ.`);
  } else if (countries.length > 1) {
    out.push(`The wines come from ${countries.length} countries. Do not name the evening after one region. Find the common thread (a grape, a style, a theme such as old world against new world) and present the evening as a journey across borders.`);
  }
  if (grapes.length === 1 && wines.length >= 3 && countries.length + regions.length > 2) {
    out.push(`Every wine is made mainly from the same grape (${grapes[0]}). Make the grape the theme: how it tastes different from place to place.`);
  }
  if (styles.length > 1) {
    out.push(`The wines are of different styles (${styles.join(', ')}). Say how the evening moves between them, e.g. a sparkling or white start and a sweet or fortified finish.`);
  }
  return out;
}

export const onRequestPost = async ({ request, env }: { request: Request; env: AiEnv }) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_signed_in' }, 401);
  let body: { tasting_id?: unknown; lang?: unknown; model?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const id = str(body.tasting_id) ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_request' }, 400);

  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` };
  const cols = 'name,producer,vintage,style,appellation,region,country,grapes,description';
  const wineCols = `blind,revealed,wines(${cols})`;
  const [tRes, wRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/tastings?id=eq.${id}&select=title,language,blind`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/tasting_wines?tasting_id=eq.${id}&select=sort_order,${wineCols}&order=sort_order`, { headers }),
  ]);
  const tasting = ((tRes.ok ? await tRes.json() : []) as { title: string; language: string | null; blind: boolean }[])[0];
  if (!tasting) return json({ error: 'not_found' }, 404);
  // Wines hidden from the guests are left out; blind wines are only described by their style
  const rows = ((wRes.ok ? await wRes.json() : []) as Row[]).filter((r) => r.wines && r.revealed);
  if (!rows.length) return json({ error: 'no_wines' }, 400);
  const limited = await overDailyLimit(request, 'ai', { t_id: id });
  if (limited) return limited;
  const open = rows.filter((r) => !r.blind).map((r) => r.wines);
  const blind = rows.filter((r) => r.blind);

  const lang = [str(body.lang), tasting.language].find((l) => l && LANGS[l]) ?? 'da';
  const list = rows.map((r, i) => r.blind
    ? `${i + 1}. A BLIND wine – style: ${r.wines.style ?? 'unknown'} (nothing else may be said about it)`
    : `${i + 1}. ${[r.wines.producer, r.wines.name, r.wines.vintage].filter(Boolean).join(' ')}`
      + ` – ${[r.wines.style, r.wines.appellation, r.wines.region, r.wines.country, r.wines.grapes ? `grapes: ${r.wines.grapes}` : null].filter(Boolean).join(', ')}`
      + (r.wines.description ? ` – notes: ${r.wines.description.slice(0, 300)}` : '')).join('\n');
  const guidance = blind.length === rows.length
    ? ['It is a BLIND tasting: the guests must not learn anything about the wines in advance. Do not guess or hint at regions, grapes, producers or vintages. Write about the fun of tasting blind – trusting nose and palate, guessing, the reveal – and you may mention how many wines and their colours.']
    : [...(blind.length ? [`${blind.length} of the wines are BLIND: say nothing about them except that they will be revealed during the evening.`] : []), ...shapeOf(open)];
  const prompt = `You write the introduction a host shows their guests on the invitation to a wine tasting.
Tasting: "${tasting.title}"
The wines, in the order they are poured:
${list}

${guidance.length ? `About this tasting:\n${guidance.map((g) => `- ${g}`).join('\n')}\n` : ''}
Write the introduction in ${LANGS[lang]}: exactly 2 short paragraphs separated by a blank line, at most 120 words in all, warm and inviting but not over the top. Say each thing once – do not repeat yourself.
Say what the evening is about and how the wines lead from one to the next, from the first to the last. Write natural, idiomatic ${LANGS[lang]} – no translated-sounding phrases or wine-jargon clichés.
Use only facts from the list – no scores, prices, dates, places or producers' stories that are not given. Do not list every wine.
Write to the guests ("we", "you"). Plain text only: no headings, no bullet points, no markdown, no greeting, no signature.`;

  try {
    // For trying models side by side: only these
    const model = MODELS.includes(String(body.model)) ? String(body.model) : WRITER;
    const out = await meteredAi(env, request, 'intro').run(model, { messages: [{ role: 'user', content: prompt }], max_tokens: 1200, temperature: 0.4 }) as Record<string, unknown>;
    const text = answerText(out).replace(/\*\*/g, '').trim();
    if (!text) return json({ error: 'empty' }, 502);
    return json({ text, lang, model, usage: out.usage ?? null });
  } catch {
    return json({ error: 'model_failed' }, 502);
  }
};
