// Admin, one tasting: its hosts. The owner adds co-hosts by email and removes them;
// co-hosts see the list. Everything goes through security-definer functions in the database.
import { supabase } from './supabase';
import { $, mk } from './admin-common';
import { t } from '../i18n';

type HostRow = { email: string; name: string | null; owner: boolean; pending: boolean; me: boolean };

export function initHosts(tastingId: string, slug: string, isOwner: boolean) {
  const list = $('hosts-list');
  const form = $<HTMLFormElement>('host-add');
  const input = $<HTMLInputElement>('host-email');
  const msg = $('host-msg');
  form.hidden = !isOwner;

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

  async function load() {
    const { data } = await supabase.rpc('tasting_cohosts', { t_id: tastingId });
    const rows = (data ?? []) as HostRow[];
    list.replaceChildren(...rows.map((r) => {
      const li = mk('li', 'host-row');
      const who = mk('div', 'host-who');
      const name = mk('span', 'host-name', r.name || r.email);
      if (r.me) name.append(mk('span', 'host-me', ` (${t('hosts.you')})`));
      who.append(name);
      if (r.name) who.append(mk('span', 'host-email', r.email));
      li.append(who);
      const tag = r.owner ? t('hosts.owner') : r.pending ? t('hosts.pending') : t('hosts.cohost');
      li.append(mk('span', 'host-tag' + (r.pending ? ' pending' : r.owner ? ' owner' : ''), tag));
      if (isOwner && !r.owner) {
        const del = mk('button', 'text-btn danger', t('hosts.remove')) as HTMLButtonElement;
        del.type = 'button';
        // Two taps instead of a browser dialog
        del.addEventListener('click', async () => {
          if (!del.dataset.armed) {
            del.dataset.armed = '1';
            del.textContent = t('hosts.removeConfirm');
            setTimeout(() => { delete del.dataset.armed; del.textContent = t('hosts.remove'); }, 4000);
            return;
          }
          const { error } = await supabase.rpc('remove_cohost', { t_id: tastingId, e: r.email });
          if (error) say(t('hosts.failed')); else { say(''); load(); }
        });
        li.append(del);
      }
      return li;
    }));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say(t('guest.emailBad')); input.focus(); return; }
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
    say(data === 'active' ? t('hosts.addedActive', { email }) : t('hosts.addedPending', { email }), true);
    showLink(email);
    load();
  });

  load();
}
