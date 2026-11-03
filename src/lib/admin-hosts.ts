// Admin, one tasting: its hosts. The owner adds co-hosts by email and removes them;
// co-hosts see the list. Everything goes through security-definer functions in the database.
import { supabase } from './supabase';
import { personRow } from './ui/person-row';
import { $, mk, sheetPanel, iconButton } from './admin-common';
import { confirmModal } from './confirm';
import { toast } from './toast';
import { t, lang } from '../i18n';

type HostRow = { email: string; name: string | null; owner: boolean; pending: boolean; me: boolean };

export function initHosts(tastingId: string, slug: string, isOwner: boolean) {
  const list = $('hosts-list');
  const form = $<HTMLFormElement>('host-add');
  const input = $<HTMLInputElement>('host-email');
  const msg = $('host-msg');
  // Adding hosts: a side panel, opened by the owner's "Add host"
  const panel = sheetPanel($<HTMLDialogElement>('host-panel'));
  $('host-open').hidden = !isOwner;
  $('host-open').addEventListener('click', () => {
    say('');
    $('host-link').hidden = true;
    closeConfirm();
    panel.open();
    if (matchMedia('(min-width: 48rem)').matches) input.focus();
  });

  const say = (text: string, ok = false) => {
    msg.textContent = text;
    msg.className = 'message ' + (ok ? 'ok' : 'error');
    msg.hidden = !text;
  };

  // The link a new host opens: sign in, then straight to this tasting's admin
  const linkFor = () => `${location.origin}/login/?next=${encodeURIComponent(`/t/${slug}/admin/`)}`;
  function showLink(email: string) {
    $('host-link').hidden = false;
    $('host-link-text').textContent = t('hosts.sendLink', { email });
    $<HTMLInputElement>('host-link-url').value = linkFor();
  }
  $('host-link-copy').addEventListener('click', async () => {
    const field = $<HTMLInputElement>('host-link-url');
    try { await navigator.clipboard.writeText(field.value); } catch { field.select(); document.execCommand('copy'); }
    $('host-link-copy').textContent = t('hosts.copied');
    setTimeout(() => ($('host-link-copy').textContent = t('hosts.copy')), 1500);
  });

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
          if (!(await confirmModal(t('hosts.removeQ', { name: r.name || r.email }), t('hosts.remove')))) return;
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

  const confirmBox = $('host-confirm');
  function closeConfirm() { confirmBox.hidden = true; confirmBox.replaceChildren(); }

  /** Adds the co-host and emails the invitation (or shows the link when the mail cannot be sent). */
  async function addHost(email: string, name: string) {
    const btn = $<HTMLButtonElement>('host-add-btn');
    btn.disabled = true;
    const { data, error } = await supabase.rpc('add_cohost', { t_id: tastingId, e: email });
    btn.disabled = false;
    if (error) {
      say(error.message.includes('already_owner') ? t('hosts.isOwner')
        : error.message.includes('too_many') ? t('hosts.tooMany') : t('hosts.failed'));
      return;
    }
    input.value = '';
    $<HTMLInputElement>('host-name').value = '';
    const added = data === 'active' ? t('hosts.addedActive', { email }) : t('hosts.addedPending', { email });
    $('host-link').hidden = true;
    say(added, true);
    load();
    btn.disabled = true;
    const sent = await sendInvite(email, name);
    btn.disabled = false;
    if (sent) say(`${added} ${t('hosts.mailSent', { email })}`, true);
    else { say(`${added} ${t('hosts.mailFailed')}`, true); showLink(email); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    closeConfirm();
    const email = input.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say(t('guest.emailBad')); input.focus(); return; }
    // Already a host here: no new invitation
    const host = hosts.find((h) => h.email === email);
    if (host) { say(host.owner ? t('hosts.isOwner') : t('hosts.alreadyHost', { email })); return; }
    const typed = $<HTMLInputElement>('host-name').value.trim();
    say('');
    // Already a guest: ask whether that guest should also be a co-host (under the name they already have)
    const guestName = await existingGuest(email);
    if (!guestName) { await addHost(email, typed); return; }
    confirmBox.append(mk('p', '', t('hosts.isGuest', { email, name: guestName })));
    const row = mk('div', 'row-actions');
    const yes = mk('button', 'btn small', t('hosts.makeCohost', { name: guestName })) as HTMLButtonElement;
    yes.type = 'button';
    yes.addEventListener('click', async () => { closeConfirm(); await addHost(email, guestName); });
    const no = mk('button', 'text-btn', t('common.cancel')) as HTMLButtonElement;
    no.type = 'button';
    no.addEventListener('click', closeConfirm);
    row.append(yes, no);
    confirmBox.append(row);
    confirmBox.hidden = false;
    yes.focus();
  });

  load();
}
