// Signing in links invitations and co-host places to the account (link_me in the database).
// The tastings that a sign-in just made me co-host of are kept for a one-time welcome.
import { supabase } from './supabase';

type Linked = { slug: string; title: string };
const KEY = 'cohost_welcome';
let pending: Linked[] = [];
let running: Promise<Linked[]> | null = null;

/** Runs once per page, whoever asks first (the sign-in page, the header or the admin page).
 *  Gives the tastings this call just made me co-host of. */
export function linkMe(): Promise<Linked[]> {
  return (running ??= (async () => {
    const { data } = await supabase.rpc('link_me_tastings');
    const rows = (data ?? []) as Linked[];
    if (!rows.length) return rows;
    pending = rows;
    try { sessionStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* kept in memory */ }
    return rows;
  })());
}

/** The tastings to welcome the new co-host to – given out once */
export function takeCohostWelcome(): Linked[] {
  let rows = pending;
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) rows = JSON.parse(saved) as Linked[];
    sessionStorage.removeItem(KEY);
  } catch { /* use what is in memory */ }
  pending = [];
  return rows;
}
