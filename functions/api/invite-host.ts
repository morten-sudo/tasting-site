// Cloudflare Pages Function: POST /api/invite-host  { tasting_id, email, name?, lang? }
// Emails a new co-host: "Hi <name>, you are invited as co-host of <tasting>. Click here for more info."
// Only the tasting's owner may call it, and only for an email that is already on the tasting's
// list of hosts (added through add_cohost) – so it cannot be used to send mail to anyone else.
import { connect } from 'cloudflare:sockets';
import { SUPABASE_URL, SUPABASE_KEY, SITE_NAME } from '../../src/lib/config';
import { json, str, logUsage } from '../../src/server/wine-ai';
import { sendMail, type MailEnv } from '../../src/server/smtp';
import { inviteHostMail } from '../../src/server/mail-texts';

type HostRow = { email: string; name: string | null; owner: boolean; pending: boolean; me: boolean };

export const onRequestPost = async ({ request, env }: { request: Request; env: MailEnv }) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_signed_in' }, 401);
  let body: { tasting_id?: unknown; email?: unknown; name?: unknown; lang?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const tastingId = str(body.tasting_id) ?? '';
  const email = (str(body.email) ?? '').toLowerCase();
  const givenName = str(body.name)?.slice(0, 80) ?? null;
  const lang = str(body.lang) ?? 'da';
  if (!/^[0-9a-f-]{36}$/i.test(tastingId) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'bad_request' }, 400);

  // Everything is read as the signed-in host, so the database decides what they may see
  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const [hostsRes, tastingRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/tasting_cohosts`, { method: 'POST', headers, body: JSON.stringify({ t_id: tastingId }) }),
    fetch(`${SUPABASE_URL}/rest/v1/tastings?id=eq.${tastingId}&select=slug,title`, { headers }),
  ]);
  const hosts = (hostsRes.ok ? await hostsRes.json() : []) as HostRow[];
  const tasting = ((tastingRes.ok ? await tastingRes.json() : []) as { slug: string; title: string }[])[0];
  const me = hosts.find((h) => h.me);
  const invited = hosts.find((h) => !h.owner && h.email === email);
  if (!tasting || !me?.owner) return json({ error: 'not_owner' }, 403);
  if (!invited) return json({ error: 'not_a_host' }, 400);

  const origin = new URL(request.url).origin;
  const link = `${origin}/login/?next=${encodeURIComponent(`/t/${tasting.slug}/admin/`)}`;
  const texts = inviteHostMail(lang, { name: givenName || invited.name, tasting: tasting.title, link, inviter: me.name });
  try {
    const sent = await sendMail(env, (hostname, port) => connect({ hostname, port }, { secureTransport: 'on', allowHalfOpen: false }), {
      to: email, fromName: me.name ? `${me.name} · ${SITE_NAME}` : SITE_NAME, replyTo: me.email, ...texts,
    });
    if (sent) await logUsage(request, 'host-invite');
    return sent ? json({ sent: true }) : json({ error: 'mail_not_set_up' }, 503);
  } catch (e) {
    console.log('invite-host mail failed', String(e).replace(/[A-Za-z0-9+/=]{20,}/g, '…'));
    return json({ error: 'mail_failed' }, 502);
  }
};
