// Admin, one tasting: its hosts. The owner adds co-hosts by email and removes them;
// co-hosts see the list. Everything goes through security-definer functions in the database.
import { supabase } from './supabase';
import { personRow } from './ui/person-row';
import { $, sheetPanel, iconButton } from './admin-common';
import { confirmModal } from './ui/confirm';
import { toast } from './ui/toast';
import { copyText } from './ui/copy';
import { setLoading } from './ui/button';
import { fieldError } from './field-error';
import { t, lang } from '../i18n';

type HostRow = { email: string; name: string | null; owner: boolean; pending: boolean; me: boolean };

export function initHosts(tastingId: string, slug: string, isOwner: boolean) {
  const list = $('hosts-list');
  const form = $<HTMLFormElement>('host-add');
  const input = $<HTMLInputElement>('host-email');
  // Adding hosts: a side panel, opened by the owner's "Add host"
  const panel = sheetPanel($<HTMLDialogElement>('host-panel'), { dirty: 'form' });
  $('host-open').hidden = !isOwner;
  $('host-open').addEventListener('click', () => {
    fieldError(input, null);
    $('host-link').hidden = true;
    panel.open();
    if (matchMedia('(min-width: 48rem)').matches) input.focus();
  });

  // Problems with the email go under the field
  const say = (text: string) => { fieldError(input, text); input.focus(); };

  // The link a new host opens: sign in, then straight to this tasting's admin
  const linkFor = () => `${location.origin}/login/?next=${encodeURIComponent(`/t/${slug}/admin/`)}`;
  function showLink(email: string) {
    $('host-link').hidden = false;
    $('host-link-text').textContent = t('hosts.sendLink', { email });
    $<HTMLInputElement>('host-link-url').value = linkFor();
  }
  $('host-link-copy').addEventListener('click', () => copyText($<HTMLInputElement>('host-link-url').value, t('hosts.linkCopied'), $<HTMLInputElement>('host-link-url')));

  let hosts: HostRow[] = [];

  async function load() {
    const { data } = await supabase.rpc('tasting_cohosts', { t_id: tastingId });
    const rows = (data ?? []) as HostRow[];
    hosts = rows;
    list.replaceChildren(...rows.map((r) => {
      const actions: HTMLElement[] = [];
      if (isOwner && !r.owner) {
        const del = iconButton('trash', `${t('hosts.remove')}: ${r.name || r.email}`, { quiet: true });
        del.dataset.tip = t('hosts.remove');
        // Asked first, in a small window
        del.addEventListener('click', async () => {
          if (!(await confirmModal({ title: t('hosts.removeQ', { name: r.name || r.email }), ok: t('hosts.remove'), danger: true }))) return;
          const { error } = await supabase.rpc('remove_cohost', { t_id: tastingId, e: r.email });
          if (error) toast(t('hosts.failed'), { kind: 'error' });
          else { toast(t('hosts.removed', { name: r.name || r.email }), { kind: 'ok' }); load(); }
        });
        actions.push(del);
      }
      // The same row as the guests
      return personRow({
        name: r.name || r.email, you: r.me ? t('hosts.you') : null, meta: r.name ? [r.email] : [],
        chips: [r.owner ? { text: t('hosts.owner'), tone: 'strong' } : r.pending ? { text: t('hosts.pending'), tone: 'wait' } : { text: t('hosts.cohost') }],
        actions,
      });
    }));
  }

  async function sendInvite(email: string, name: string) {
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch('/api/invite-host', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ tasting_id: tastingId, email, name: name || null, lang: lang() }),
      });
      return res.ok && ((await res.json()) as { sent?: boolean }).sent === true;
    } catch { return false; }
  }

  /** The name this email already has as a guest – of this tasting or in the host's guest list. */
  async function existingGuest(email: string): Promise<string | null> {
    const [p, g] = await Promise.all([
      supabase.from('participants').select('name').eq('tasting_id', tastingId).eq('email', email).limit(1),
      supabase.from('guests').select('name').eq('email', email).limit(1),
    ]);
    const row = ((p.data ?? [])[0] ?? (g.data ?? [])[0]) as { name: string } | undefined;
    return row?.name ?? null;
  }

  /** Adds the co-host and emails the invitation (or shows the link when the mail cannot be sent). */
  async function addHost(email: string, name: string) {
    const btn = $<HTMLButtonElement>('host-add-btn');
    setLoading(btn, true);
    const { data, error } = await supabase.rpc('add_cohost', { t_id: tastingId, e: email });
    if (error) {
      setLoading(btn, false);
      if (error.message.includes('already_owner')) say(t('hosts.isOwner'));
      else if (error.message.includes('too_many')) say(t('hosts.tooMany'));
      else toast(t('hosts.failed'), { kind: 'error' });
      return;
    }
    const added = data === 'active' ? t('hosts.addedActive', { email }) : t('hosts.addedPending', { email });
    load();
    const sent = await sendInvite(email, name);
    setLoading(btn, false);
    input.value = '';
    $<HTMLInputElement>('host-name').value = '';
    panel.markClean();
    // Sent: done – the panel closes and says so. Not sent: the panel stays with the link to pass on.
    if (sent) { panel.close(); toast(`${added} ${t('hosts.mailSent', { email })}`); }
    else { toast(added); showLink(email); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say(t('guest.emailBad')); return; }
    // Already a host here: no new invitation
    const host = hosts.find((h) => h.email === email);
    if (host) { say(host.owner ? t('hosts.isOwner') : t('hosts.alreadyHost', { email })); return; }
    const typed = $<HTMLInputElement>('host-name').value.trim();
    // Already a guest: ask whether that guest should also be a co-host (under the name they already have)
    const guestName = await existingGuest(email);
    if (!guestName) { await addHost(email, typed); return; }
    const ok = await confirmModal({ title: t('hosts.makeCohostQ', { name: guestName }), text: t('hosts.isGuestText', { email, name: guestName }),
      ok: t('hosts.makeCohostBtn') });
    if (ok) await addHost(email, guestName);
  });

  load();
}
