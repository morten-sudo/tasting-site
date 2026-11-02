// Cloudflare Pages Function: POST /api/locate  { appellation, region, country }
// Asks the AI model in Workers AI where a wine appellation lies (its main village), for the
// overview map when the appellation is not on our list. Only signed-in hosts may call it.
// The browser then saves the place through save_place_guess(), which refuses places outside the country.
import { MODEL, isHost, json, parseAnswer, str, type AiEnv, meteredAi } from '../../src/server/wine-ai';

export const onRequestPost = async ({ request, env }: { request: Request; env: AiEnv }) => {
  if (!(await isHost(request))) return json({ error: 'not_host' }, 403);
  let body: { appellation?: unknown; region?: unknown; country?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const appellation = str(body.appellation)?.slice(0, 120);
  const region = str(body.region)?.slice(0, 80) ?? null;
  const country = str(body.country)?.toUpperCase() ?? '';
  if (!appellation || !/^[A-Z]{2}$/.test(country)) return json({ error: 'bad_request' }, 400);

  const prompt = `Where is the wine appellation "${appellation}"${region ? ` (region: ${region})` : ''} in the country with ISO code ${country}?
Return ONLY a JSON object: {"place": the main village or town of the appellation, "lat": its latitude, "lon": its longitude}.
Use decimal degrees. If you do not know the appellation, return {"place": null, "lat": null, "lon": null}. No other text.`;
  let answer: Record<string, unknown> | null = null;
  try {
    const out = await meteredAi(env, request, 'locate').run(MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 120, temperature: 0 });
    answer = parseAnswer(out.response);
  } catch {
    return json({ error: 'model_failed' }, 502);
  }
  const lat = Number(answer?.lat), lon = Number(answer?.lon);
  if (!answer || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ found: false });
  }
  return json({ found: true, place: str(answer.place), lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 });
};
