// Cloudflare Pages Function: POST /api/notify { token } – asked by the database (pg_net) when something hosts may
// want an email about has happened. The token is a random one-time code the database gave those events; with it
// the events are fetched (and marked sent), and each host gets what they chose, one email per tasting.
// Without the right token nothing comes back, so calling this from anywhere else sends nothing.
import { connect } from 'cloudflare:sockets';
import { SUPABASE_URL, SUPABASE_KEY, SITE_NAME } from '../../src/lib/config';
import { json, logUsage } from '../../src/server/wine-ai';
import { sendMail, type MailEnv } from '../../src/server/smtp';
import { updatesMail } from '../../src/server/mail-texts';
import { formatKr } from '../../src/lib/ui/kr';

type Env = MailEnv;
type Batch = { to: string; name: string | null; lang: string; title: string; slug: string;
  items: { kind: string; guest: string | null; at: string; detail: Record<string, unknown> }[] };

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  let body: { token?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const token = typeof body.token === 'string' && /^[0-9a-f-]{36}$/i.test(body.token) ? body.token : null;
  if (!token) return json({ error: 'bad_request' }, 400);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_notifications`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tok: token }),
  });
  if (!res.ok) return json({ error: 'claim_failed' }, 502);
  const batches = (await res.json()) as Batch[];
  const origin = new URL(request.url).origin;
  let sent = 0;
  for (const b of batches) {
    // The most fitting part of the tasting's admin: chat, orders or guests
    const kinds = new Set(b.items.map((i) => i.kind));
    const part = kinds.size === 1 && kinds.has('chat') ? 'chat/' : kinds.size === 1 && kinds.has('order') ? 'orders/' : 'guests/';
    const texts = updatesMail(b.lang, { tasting: b.title, items: b.items, link: `${origin}/t/${b.slug}/admin/${part}`, settings: `${origin}/profile/#notify`, money: formatKr });
    try {
      if (await sendMail(env, (hostname, port) => connect({ hostname, port }, { secureTransport: 'on', allowHalfOpen: false }),
        { to: b.to, fromName: SITE_NAME, replyTo: null, ...texts })) sent++;
    } catch (e) {
      console.log('notify mail failed', String(e).replace(/[A-Za-z0-9+/=]{20,}/g, '…'));
    }
  }
  if (sent) await logUsage(null, 'notify', { n: sent });
  return json({ sent });
};
