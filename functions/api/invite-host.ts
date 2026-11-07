// Cloudflare Pages Function: POST /api/invite-host  { tasting_id, email, name?, lang? } or { tenant_id, email, name?, lang? }
// Emails a new co-host: "Hi <name>, you are invited as co-host of <tasting>. Click here for more info." – or, with
// tenant_id, a new host on an account: "Morten has added you as a host on the account Holte Wine Club."
// Only the tasting's (or account's) owner may call it, and only for an email that is already on the tasting's list of
// hosts (added through add_cohost) or on the account (add_tenant_member) – so it cannot mail anyone else.
import { connect } from 'cloudflare:sockets';
import { SUPABASE_URL, SUPABASE_KEY, SITE_NAME } from '../../src/lib/config';
import { json, str, logUsage, overDailyLimit } from '../../src/server/wine-ai';
import { sendMail, isMailAddress, type MailEnv } from '../../src/server/smtp';
import { inviteHostMail, inviteWorkspaceMail } from '../../src/server/mail-texts';
import { mailOrigin } from '../../src/server/mail-links';

type HostRow = { email: string; name: string | null; owner: boolean; pending: boolean; me: boolean };

export const onRequestPost = async ({ request, env }: { request: Request; env: MailEnv }) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_signed_in' }, 401);
  let body: { tasting_id?: unknown; tenant_id?: unknown; email?: unknown; name?: unknown; lang?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const tastingId = str(body.tasting_id) ?? '';
  const tenantId = str(body.tenant_id) ?? '';
  const email = (str(body.email) ?? '').toLowerCase();
  const givenName = str(body.name)?.slice(0, 80) ?? null;
  const lang = str(body.lang) ?? 'da';
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!(uuid.test(tastingId) || (!tastingId && uuid.test(tenantId))) || !isMailAddress(email)) return json({ error: 'bad_request' }, 400);

  // Everything is read as the signed-in host, so the database decides what they may see
  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const origin = mailOrigin(request.url);   // the app address (WIN-197)
  if (!tastingId) return inviteToWorkspace(request, env, headers, { tenantId, email, givenName, lang, origin });

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
  const limited = await overDailyLimit(request, 'mail', { t_id: tastingId });
  if (limited) return limited;

  const link = `${origin}/login/?next=${encodeURIComponent(`/t/${tasting.slug}/admin/`)}`;
  const texts = inviteHostMail(lang, { name: givenName || invited.name, tasting: tasting.title, link, inviter: me.name });
  try {
    return await send(request, env, { to: email, fromName: me.name, replyTo: me.email, texts });
  } catch (e) {
    console.log('invite-host mail failed', String(e).replace(/[A-Za-z0-9+/=]{20,}/g, '…'));
    return json({ error: 'mail_failed' }, 502);
  }
};

type Texts = { subject: string; text: string; html: string };
async function send(request: Request, env: MailEnv, m: { to: string; fromName: string | null; replyTo: string; texts: Texts }) {
  const sent = await sendMail(env, (hostname, port) => connect({ hostname, port }, { secureTransport: 'on', allowHalfOpen: false }), {
    to: m.to, fromName: m.fromName ? `${m.fromName} · ${SITE_NAME}` : SITE_NAME, replyTo: m.replyTo, ...m.texts,
  });
  if (sent) await logUsage(request, 'host-invite');
  return sent ? json({ sent: true }) : json({ error: 'mail_not_set_up' }, 503);
}

/** A host added to an account: workspace_invite_info answers only the account's owner, only for a host on its list */
async function inviteToWorkspace(request: Request, env: MailEnv, headers: Record<string, string>,
  v: { tenantId: string; email: string; givenName: string | null; lang: string; origin: string }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/workspace_invite_info`, { method: 'POST', headers, body: JSON.stringify({ e: v.email, tn: v.tenantId }) });
  const info = (res.ok ? await res.json() : null) as { name: string; invitee: string | null; owner_name: string | null; owner_email: string } | null;
  if (!info) return json({ error: 'not_owner' }, 403);
  const limited = await overDailyLimit(request, 'mail', { tn: v.tenantId });
  if (limited) return limited;
  const link = `${v.origin}/login/?next=${encodeURIComponent(`/admin/?ws=${v.tenantId}`)}`;
  const texts = inviteWorkspaceMail(v.lang, { name: v.givenName || info.invitee, account: info.name, link, inviter: info.owner_name });
  try {
    return await send(request, env, { to: v.email, fromName: info.owner_name, replyTo: info.owner_email, texts });
  } catch (e) {
    console.log('invite-host (account) mail failed', String(e).replace(/[A-Za-z0-9+/=]{20,}/g, '…'));
    return json({ error: 'mail_failed' }, 502);
  }
}
