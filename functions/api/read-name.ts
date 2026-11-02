// Cloudflare Pages Function: POST /api/read-name
// A wine added by its name only: what is generally known about it (producer, vintage, type, origin, grapes) and a
// short description, from a text model in Cloudflare Workers AI. Only signed-in hosts may call it. The host checks it.
import { MODEL, FIELDS_SPEC, isHost, json, parseAnswer, str, toFields, type AiEnv, meteredAi } from '../../src/server/wine-ai';

const LANG_NAMES: Record<string, string> = { da: 'Danish', en: 'English', is: 'Icelandic', fr: 'French', de: 'German', it: 'Italian', es: 'Spanish', nl: 'Dutch', pl: 'Polish' };

export const onRequestPost = async ({ request, env }: { request: Request; env: AiEnv }) => {
  if (!(await isHost(request))) return json({ error: 'not_host' }, 403);
  let body: { name?: string; lang?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (name.length < 3) return json({ error: 'bad_name' }, 400);
  const lang = LANG_NAMES[body.lang ?? ''] ? body.lang! : 'da';

  const prompt = `A host has added a wine to a wine tasting by typing its name: "${name}".
Return ONLY a JSON object with these keys:
${FIELDS_SPEC},
"description": two sentences in ${LANG_NAMES[lang]} about the wine's style and taste, or null if you do not know this wine.
Fill in only what the name says or what is well known about exactly this wine (e.g. the producer and region of a known estate,
the grapes of a protected appellation). Use null whenever you are unsure – a wrong answer is worse than none. No other text.`;

  let answer: Record<string, unknown> | null = null;
  try {
    const out = await meteredAi(env, request, 'name').run(MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.1,
    });
    answer = parseAnswer(out.response);
  } catch {
    return json({ error: 'model_failed' }, 502);
  }
  if (!answer) return json({ error: 'unreadable' }, 422);
  return json({ ...toFields(answer, [name]), description: str(answer.description) });
};
