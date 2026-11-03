// The account (workspace) the host admin shows. A host can be on more than one account; which one the admin shows
// is a choice on this device (the last one used is remembered), never a security boundary – the database lets a
// host see every account they are a member of, and new rows name the account they go into.
import { t, lang } from '../i18n';

export type Workspace = { id: string; name: string; own_name: string | null; owner_name: string; role: 'owner' | 'host'; is_default: boolean };

const KEY = 'wt-workspace';

/** The account chosen last on this device (null in private mode or the first time) */
export function storedWorkspace(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function rememberWorkspace(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* private mode: the default account is used next time */ }
}

let current: string | null = null;
/** The account the admin shows now (set by requireHost) */
export const currentWorkspace = () => current;
export const setCurrentWorkspace = (id: string) => { current = id; };

/** What an account is called: its name, else "Your account" / "Anna's account" (the owner's first name, as the
 *  account's address: askes-konto) */
export function workspaceLabel(w: Workspace): string {
  if (w.own_name) return w.own_name;
  if (w.role === 'owner') return t('ws.yours');
  const first = (w.owner_name ?? '').trim().split(/\s+/)[0] ?? '';
  const label = t('ws.ofName', { name: first });
  // Danish: Hans' konto, not Hanss konto
  return lang() === 'da' && /[sxz]$/i.test(first) ? label.replace(`${first}s `, `${first}' `) : label;
}
