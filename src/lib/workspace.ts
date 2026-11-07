// The account (workspace) the host admin shows. A host can be on more than one account; which one the admin shows
// is in the address (/w/<id>/…, WIN-253) and the last one used is remembered on this device, never a security
// boundary – the database lets a host see every account they are a member of, and new rows name the account they go into.
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

// ---------- The account in the address (WIN-253) ----------
// The host's account pages carry the account: /w/<account id>/<page>/ (overview, tastings, wines – also a wine's own
// long address –, guests, account, help, news). They are the /admin/<page>/ pages (public/_redirects serves them on
// /w/…), and the code keeps using /admin/… inside: adminPath() reads the address as /admin/…, wsHref() writes an
// /admin/… link as the account's address. The id in the address is a sign, not a key: requireHost only ever shows
// an account the database lists as mine, and an account that is not mine (or does not exist) gives way to my own.
// A tasting's admin stays on the tasting's address (/t/<slug>/admin/…).
const IN_PATH = /^\/w\/([^/]+)(\/.*)?$/;
/** The account pages, as /admin/… */
const PAGES = /^\/admin\/(?:(?:tastings|wines|guests|account|help|news)(?:\/.*)?)?$/;
export const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The account the address names (/w/<id>/…), or null when it names none */
export function workspaceInPath(path = location.pathname): string | null {
  const id = path.match(IN_PATH)?.[1];
  if (id == null) return null;
  try { return decodeURIComponent(id); } catch { return id; }
}
/** The address as the /admin/… page it is: /w/<id>/wines/pt/… → /admin/wines/pt/… (anything else as it is) */
export function adminPath(path = location.pathname): string {
  const m = path.match(IN_PATH);
  return m ? '/admin' + (m[2] ?? '/') : path;
}
/** Is this an account page (/admin/… or /w/<id>/…, not a tasting's admin)? */
export const isWorkspacePage = (path = location.pathname) => PAGES.test(adminPath(path));

/** A link to an account page in the account's address: /admin/wines/?new → /w/<id>/wines/?new. Other links as they are. */
export function wsHref(href: string, id: string | null = current): string {
  if (!id) return href;
  const m = href.match(/^\/admin(\/[^?#]*)?([?#].*)?$/);
  if (!m) return href;
  const path = '/admin' + (m[1] ?? '/');
  if (!PAGES.test(path)) return href;
  return `/w/${id}${path.slice('/admin'.length)}${m[2] ?? ''}`;
}
