// Cloudflare Pages Function: POST /api/notify – asked by the database (pg_net) when something hosts may want an
// email about has happened. Fetches the waiting events with the shared secret (NOTIFY_SECRET, the same as the
// database's vault secret 'notify_secret') and emails each host what they chose, one email per tasting.
import { connect } from 'cloudflare:sockets';
import { SUPABASE_URL, SUPABASE_KEY, SITE_NAME } from '../../src/lib/config';
import { json } from '../../src/server/wine-ai';
import { sendMail, type MailEnv } from '../../src/server/smtp';
import { updatesMail } from '../../src/server/mail-texts';

type Env = MailEnv & { NOTIFY_SECRET?: string };
type Batch = { to: string; name: string | null; lang: string; title: string; slug: string;
  items: { kind: string; guest: string | null; at: string; detail: Record<string, unknown> }[] };

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const secret = env.NOTIFY_SECRET;
  if (!secret || request.headers.get('x-notify-secret') !== secret) return json({ error: 'forbidden' }, 403);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_notifications`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ secret }),
  });
  if (!res.ok) return json({ error: 'claim_failed' }, 502);
  const batches = (await res.json()) as Batch[];
  const origin = new URL(request.url).origin;
  let sent = 0;
  for (const b of batches) {
    // The most fitting part of the tasting's admin: chat, orders or guests
    const kinds = new Set(b.items.map((i) => i.kind));
    const part = kinds.size === 1 && kinds.has('chat') ? 'chat/' : kinds.size === 1 && kinds.has('order') ? 'orders/' : 'guests/';
    const money = (n: number) => new Intl.NumberFormat(b.lang, { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n);
    const texts = updatesMail(b.lang, { tasting: b.title, items: b.items, link: `${origin}/t/${b.slug}/admin/${part}`, settings: `${origin}/profile/#notify`, money });
    try {
      if (await sendMail(env, (hostname, port) => connect({ hostname, port }, { secureTransport: 'on', allowHalfOpen: false }),
        { to: b.to, fromName: SITE_NAME, replyTo: null, ...texts })) sent++;
    } catch (e) {
      console.log('notify mail failed', String(e).replace(/[A-Za-z0-9+/=]{20,}/g, '…'));
    }
  }
  return json({ sent });
};
