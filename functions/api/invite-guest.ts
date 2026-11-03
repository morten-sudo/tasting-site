// Cloudflare Pages Function: POST /api/invite-guest  { participant_id, lang? }
// Emails a guest their invitation: when, where and a button to their own invitation page (/t/<slug>/?k=<code>).
// The guest is read as the signed-in host, so only a host of the guest's tasting can send it, and only to the
// email already on the invitation. The same invitation is not mailed twice within a minute.
import { connect } from 'cloudflare:sockets';
import { SUPABASE_URL, SUPABASE_KEY, SITE_NAME } from '../../src/lib/config';
import { json, str, logUsage, overDailyLimit } from '../../src/server/wine-ai';
import { sendMail, isMailAddress, type MailEnv } from '../../src/server/smtp';
import { inviteGuestMail, INVITE_LANGS } from '../../src/server/mail-texts';

type Guest = { id: string; name: string; email: string | null; invite_code: string; invite_mailed_at: string | null;
  tastings: { id: string; slug: string; title: string; starts_at: string | null; place: string | null; language: string | null } };
type HostRow = { email: string; name: string | null; me: boolean };

export const onRequestPost = async ({ request, env }: { request: Request; env: MailEnv }) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_signed_in' }, 401);
  let body: { participant_id?: unknown; lang?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const id = str(body.participant_id) ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_request' }, 400);

  // Read as the signed-in host: the database decides whether they may see this guest
  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/participants?id=eq.${id}&select=id,name,email,invite_code,invite_mailed_at,tastings(id,slug,title,starts_at,place,language)`, { headers });
  const guest = ((res.ok ? await res.json() : []) as Guest[])[0];
  if (!guest?.tastings) return json({ error: 'not_found' }, 404);
  if (!guest.email) return json({ error: 'no_email' }, 400);
  if (!isMailAddress(guest.email)) return json({ error: 'bad_email' }, 400);
  if (guest.invite_mailed_at && Date.now() - Date.parse(guest.invite_mailed_at) < 60_000) return json({ error: 'too_soon' }, 429);
  const t = guest.tastings;
  // The account's daily limit on emails (counted on the tasting's account)
  const limited = await overDailyLimit(request, 'mail', { t_id: t.id });
  if (limited) return limited;
  const hostsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tasting_cohosts`, { method: 'POST', headers, body: JSON.stringify({ t_id: t.id }) });
  const me = ((hostsRes.ok ? await hostsRes.json() : []) as HostRow[]).find((h) => h.me);

  // The tasting's language when it has one, else the host's
  const lang = [t.language, str(body.lang)].find((l) => l && INVITE_LANGS.includes(l)) ?? 'en';
  const when = t.starts_at
    ? new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(new Date(t.starts_at))
    : null;
  const link = `${new URL(request.url).origin}/t/${t.slug}/?k=${guest.invite_code}`;
  const texts = inviteGuestMail(lang, { name: guest.name, tasting: t.title, link, inviter: me?.name ?? null, when, where: t.place });
  try {
    const sent = await sendMail(env, (hostname, port) => connect({ hostname, port }, { secureTransport: 'on', allowHalfOpen: false }), {
      to: guest.email, fromName: me?.name ? `${me.name} · ${SITE_NAME}` : SITE_NAME, replyTo: me?.email ?? null, ...texts,
    });
    if (!sent) return json({ error: 'mail_not_set_up' }, 503);
    await logUsage(request, 'invite');
  } catch (e) {
    console.log('invite-guest mail failed', String(e).replace(/[A-Za-z0-9+/=]{20,}/g, '…'));
    return json({ error: 'mail_failed' }, 502);
  }
  // Remember when it was sent (as the host, so the database checks it again)
  const at = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/participants?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify({ invite_mailed_at: at }) });
  return json({ sent: true, at });
};
