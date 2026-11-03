// When each of the account's guests was last here: signed in, or opened the invitation link (the newer of the
// two). The guest lists and the guest's page show it as "signed in …" / "opened the link …".
import { supabase } from './supabase';
import { t } from '../i18n';
import { ago } from './ui/ago';

export type Seen = { at: string; link: boolean };

export async function loadGuestSeen(): Promise<Map<string, Seen>> {
  const { data } = await supabase.rpc('guest_last_logins');
  const rows = (data ?? []) as { guest_id: string; last_sign_in_at: string | null; last_seen_at: string | null }[];
  const out = new Map<string, Seen>();
  for (const r of rows) {
    const login = r.last_sign_in_at, link = r.last_seen_at;
    if (link && (!login || link > login)) out.set(r.guest_id, { at: link, link: true });
    else if (login) out.set(r.guest_id, { at: login, link: false });
  }
  return out;
}

/** "signed in 2 hours ago" / "opened the link 2 hours ago" (short: "2 h") */
export const seenText = (s: Seen, short = false) =>
  t(s.link ? 'guestLib.lastLink' : 'guestLib.lastLogin', { when: ago(s.at, short) });
