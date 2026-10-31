// Cloudflare Pages Function: POST /api/read-label
// Reads a wine label photo with a vision model in Cloudflare Workers AI and returns
// suggested fields for the admin wine form. Only signed-in hosts may call it.
import { MODEL, FIELDS_SPEC, isHost, json, parseAnswer, toFields, type AiEnv } from '../../src/server/wine-ai';

const MAX_IMAGE_CHARS = 2_000_000; // base64 data URI, ~1.5 MB image

const PROMPT = `You read wine labels. Look at the photo and return ONLY a JSON object with these keys:
${FIELDS_SPEC}.
Use only what you can read or clearly infer from the label. Use null when unsure. No other text.`;

export const onRequestPost = async ({ request, env }: { request: Request; env: AiEnv }) => {
  if (!(await isHost(request))) return json({ error: 'not_host' }, 403);

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
      max_tokens: 400,
      temperature: 0.1,
    });
    answer = parseAnswer(out.response);
  } catch {
    return json({ error: 'model_failed' }, 502);
  }
  if (!answer) return json({ error: 'unreadable' }, 422);

  return json(toFields(answer));
};
