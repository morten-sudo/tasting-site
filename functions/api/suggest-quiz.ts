// Cloudflare Pages Function: POST /api/suggest-quiz { tasting_id, lang?, level?: 'easy'|'medium'|'expert', existing?: string[] }
// Suggests multiple-choice quiz questions for a tasting with Cloudflare Workers AI, from its wines: country and
// region, the wine itself, grapes, how it is made, classifications and terms, odd one out. Blind wines are
// asked about by their number (a guessing question), without giving them away in the question.
// Read as the signed-in host; nothing is saved here – the host adds the suggestions they want.
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/lib/config';
import { json, str, parseAnswer, type AiEnv } from '../../src/server/wine-ai';

const MODEL = '@cf/openai/gpt-oss-120b';
const LANGS: Record<string, string> = {
  da: 'Danish', en: 'English', is: 'Icelandic', fr: 'French', de: 'German', it: 'Italian', es: 'Spanish', nl: 'Dutch', pl: 'Polish',
};
// "Wine 3" in the quiz's language, so the questions match the numbers the guests see
const WINE_WORD: Record<string, string> = { da: 'Vin', en: 'Wine', is: 'Vín', fr: 'Vin', de: 'Wein', it: 'Vino', es: 'Vino', nl: 'Wijn', pl: 'Wino' };
type Wine = { name: string; producer: string | null; vintage: string | null; style: string | null; appellation: string | null;
  region: string | null; country: string | null; grapes: string | null; abv: number | null; description: string | null };
type Row = { blind: boolean; revealed: boolean; wines: Wine };
const LEVELS: Record<string, string> = {
  easy: 'EASY – for guests who simply enjoy wine: well-known countries, regions and grapes, colours and styles, simple terms. The right answer should be guessable from the evening; wrong options clearly different.',
  medium: 'MEDIUM – for interested guests: appellations within regions, main grapes of a blend, how a style is made, common classifications. Wrong options close enough to need some knowledge.',
  expert: 'EXPERT – for wine nerds: specific appellations and their neighbours, grape proportions, ageing rules and classifications, production details, vintages. Wrong options very close to the right one – but still exactly one right answer.',
};
export type Suggestion = { question: string; options: string[]; correct: number; explanation: string | null };

function answerText(out: Record<string, unknown>): string {
  if (typeof out.response === 'string') return out.response;
  if (out.response && typeof out.response === 'object') return JSON.stringify(out.response);
  const choices = out.choices as { message?: { content?: string } }[] | undefined;
  if (choices?.[0]?.message?.content) return choices[0].message.content;
  const output = out.output as { type?: string; content?: { text?: string }[] }[] | undefined;
  return output?.find((o) => o.type === 'message')?.content?.map((c) => c.text ?? '').join('') ?? '';
}

export const onRequestPost = async ({ request, env }: { request: Request; env: AiEnv }) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_signed_in' }, 401);
  let body: { tasting_id?: unknown; lang?: unknown; level?: unknown; existing?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const id = str(body.tasting_id) ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_request' }, 400);
  const existing = (Array.isArray(body.existing) ? body.existing : []).filter((x): x is string => typeof x === 'string').slice(0, 40).map((x) => x.slice(0, 200));

  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` };
  const cols = 'name,producer,vintage,style,appellation,region,country,grapes,abv,description';
  const [tRes, wRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/tastings?id=eq.${id}&select=title,language`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/tasting_wines?tasting_id=eq.${id}&select=sort_order,blind,revealed,wines(${cols})&order=sort_order`, { headers }),
  ]);
  const tasting = ((tRes.ok ? await tRes.json() : []) as { title: string; language: string | null }[])[0];
  if (!tasting) return json({ error: 'not_found' }, 404);
  const rows = ((wRes.ok ? await wRes.json() : []) as Row[]).filter((r) => r.wines && r.revealed);
  if (!rows.length) return json({ error: 'no_wines' }, 400);

  const lang = [str(body.lang), tasting.language].find((l) => l && LANGS[l]) ?? 'da';
  const level = LEVELS[String(body.level)] ? String(body.level) : 'medium';
  const list = rows.map((r, i) => {
    const w = r.wines;
    const facts = [w.style, w.appellation, w.region, w.country, w.grapes ? `grapes: ${w.grapes}` : null, w.abv ? `${w.abv}% abv` : null].filter(Boolean).join(', ');
    const name = [w.producer, w.name, w.vintage].filter(Boolean).join(' ');
    return `${WINE_WORD[lang]} ${i + 1}${r.blind ? ' (BLIND – the guests do not know what it is)' : ''}: ${name} – ${facts}`
      + (w.description ? ` – notes: ${w.description.slice(0, 250)}` : '');
  }).join('\n');

  const prompt = `You write quiz questions for the guests at a wine tasting, to answer on their phones during the evening.
Tasting: "${tasting.title}"
The wines, in the order they are poured:
${list}
${existing.length ? `\nThe quiz already has these questions – do not repeat them or ask the same thing:\n${existing.map((q) => `- ${q}`).join('\n')}\n` : ''}
Difficulty: ${LEVELS[level]}
Write 5 questions in ${LANGS[lang]}, each with 4 answer options of which exactly one is right, and a one-sentence explanation shown after the quiz.
Mix the kinds of questions, inspired by classic wine quizzes:
- the country or region a wine (or its appellation) comes from,
- the wine itself: its grape(s), its age or vintage, its style,
- how it is made: e.g. how port or other fortified wine is made, ageing in oak or bottle, the traditional method for sparkling wine, what decides sweetness,
- classifications and wine terms that fit these wines (e.g. Grand Cru, tawny, vintage, AOC/DOC),
- an "odd one out" among appellations, grapes or regions linked to the evening.
Rules:
- Facts about the wines must come from the list. General wine knowledge is fine for how wine is made and for terms, but only well-established facts – nothing you are unsure of.
- Refer to a wine exactly as in the list ("${WINE_WORD[lang]} N") when that helps. For a BLIND wine ask a guessing question (e.g. its country, grape or age) without giving the answer away in the question.
- Wrong options must be plausible and of the same kind as the right one. Questions short and clear.
- Check every question against the list: exactly ONE option may be right. For "which is NOT …" or "odd one out", make sure every other option really does fit.
Answer with JSON only, no other text:
{"questions":[{"question":"…","options":["…","…","…","…"],"correct":0,"explanation":"…"}]}
"correct" is the index (0–3) of the right option.`;

  let answer: Record<string, unknown> | null = null;
  try {
    const out = await env.AI.run(MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 3000, temperature: 0.5 }) as Record<string, unknown>;
    answer = parseAnswer(answerText(out));
  } catch {
    return json({ error: 'model_failed' }, 502);
  }
  // Only well-formed questions: 2–6 different options and a right one among them
  const questions: Suggestion[] = ((answer?.questions as unknown[]) ?? []).flatMap((q) => {
    const x = q as Record<string, unknown>;
    const question = str(x.question)?.slice(0, 500);
    const options = (Array.isArray(x.options) ? x.options : []).map((o) => str(typeof o === 'number' ? String(o) : o)?.slice(0, 300)).filter((o): o is string => !!o);
    const correct = Number(x.correct);
    if (!question || options.length < 2 || options.length > 6 || new Set(options).size !== options.length) return [];
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return [];
    return [{ question, options, correct, explanation: str(x.explanation)?.slice(0, 1000) ?? null }];
  });
  if (!questions.length) return json({ error: 'unreadable' }, 502);
  return json({ questions, lang, level });
};
