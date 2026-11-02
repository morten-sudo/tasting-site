// A producer's address → its exact place (hosts only). See src/server/geocode.ts for the sources and the precision rule.
import { isHost, json } from '../../src/server/wine-ai';
import { geocodeAddress } from '../../src/server/geocode';

export const onRequestPost = async ({ request }: { request: Request }) => {
  if (!(await isHost(request))) return json({ error: 'not_host' }, 403);
  let body: { address?: string; country?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const address = String(body.address ?? '').trim();
  if (!address) return json({ error: 'no_address' }, 400);
  const hit = await geocodeAddress(address, String(body.country ?? '').toUpperCase() || null);
  return json({ location: hit });
};
