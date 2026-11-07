// Shared by the superadmin pages: the administrator check, the menu and small helpers.
import { supabase } from './supabase';
import { i18nReady, t, dateText, type Key } from '../i18n';
import { initSideMenu, setSideOpen } from './ui/side-menu';

export { $, mk } from './ui/dom';
import { $, mk } from './ui/dom';
export function cell(text: string, cls = '') {
  const td = mk('td', cls, text);
  return td;
}
// (through dateText, so Icelandic gets the site's own month names in a browser without Icelandic data – WIN-322)
export const dateFmt = () => ({ format: (d: Date) => dateText(d, { month: 'short', year: true }) });
export const timeFmt = () => ({ format: (d: Date) => dateText(d, { month: 'short', year: true, time: true }) });

/** The parts of one tenant, each with its address /superadmin/tenants/<slug>/<path> */
export const TENANT_SECTIONS: { id: string; label: Key }[] = [
  { id: 'hosts', label: 'super.hosts' },
  { id: 'tastings', label: 'adminNav.tastings' },
  { id: 'guests', label: 'adminNav.guests' },
  { id: 'wines', label: 'adminNav.wines' },
  { id: 'payments', label: 'adminNav.payments' },
  { id: 'log', label: 'super.log' },
];
// Accounts are addressed by their slug ("askes-konto"), loaded once when the superadmin signs in; the id is the fallback
const slugs = new Map<string, string>();
export const rememberTenantSlug = (id: string, slug: string) => { if (slug) slugs.set(id, slug); };
export const tenantUrl = (id: string, section = 'hosts') => `/superadmin/tenants/${slugs.get(id) ?? id}/${section === 'hosts' ? '' : section + '/'}`;

/** Signed in as a Winetastr administrator? Sets up the menu; false shows the "only for administrators" notice. */
export async function requireAdmin(): Promise<boolean> {
  await i18nReady;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) { location.replace('/login/?next=' + encodeURIComponent(location.pathname)); return false; }
  const { data: admin } = await supabase.rpc('is_admin');
  if (admin !== true) { $('denied').hidden = false; return false; }
  const { data: list } = await supabase.rpc('admin_tenant_slugs');
  for (const r of (list ?? []) as { id: string; slug: string }[]) rememberTenantSlug(r.id, r.slug);
  $('super-main').hidden = false;
  initSideMenu(s.session.user.email ?? '', async () => { await supabase.auth.signOut(); location.href = '/'; });
  return true;
}

/** The open tenant in the menu, with its parts underneath */
export function showTenantInMenu(id: string, name: string, section: string) {
  const li = mk('li');
  const a = mk('a', '', name);
  a.href = tenantUrl(id);
  const sub = mk('ul', 'sm-sub');
  for (const s of TENANT_SECTIONS) {
    const item = mk('li');
    const link = mk('a', '', t(s.label));
    link.href = tenantUrl(id, s.id);
    link.dataset.section = s.id;
    if (s.id === section) link.setAttribute('aria-current', 'page');
    item.append(link);
    sub.append(item);
  }
  li.append(a, sub);
  $('side-tenant').replaceChildren(li);
}
export function markTenantSection(section: string) {
  document.querySelectorAll<HTMLAnchorElement>('#side-tenant [data-section]').forEach((a) => {
    if (a.dataset.section === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  setSideOpen(false);
}
