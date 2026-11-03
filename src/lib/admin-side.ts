// The admin menu on the left: the host's tastings (the tasting's own sections are tabs in the bar at the top),
// the libraries and settings. On phones the same menu opens as a drawer.
import { supabase } from './supabase';
import { badge } from './ui/badge';
import { $, mk } from './ui/dom';
import { t, type Key } from '../i18n';
import { tooltip } from './ui/tooltip';
import { initSideMenu, setSideOpen, sideSwitcher } from './ui/side-menu';
import { currentWorkspace, rememberWorkspace, workspaceLabel, type Workspace } from './workspace';

/** The parts of a tasting's admin, each with its own address /t/<slug>/admin/<path> */
export const SECTIONS: { id: string; path: string; label: Key }[] = [
  { id: 'overview', path: '', label: 'section.overview' },
  { id: 'wines', path: 'wines/', label: 'page.wines' },
  { id: 'guests', path: 'guests/', label: 'admin.guests' },
  { id: 'orders', path: 'orders/', label: 'admin.orders' },
  { id: 'quiz', path: 'quiz/', label: 'page.quiz' },
  { id: 'chat', path: 'chat/', label: 'page.chat' },
  { id: 'settings', path: 'settings/', label: 'section.settings' },
];

export const adminUrl = (slug: string, path = '') => `/t/${slug}/admin/${path}`;

/** Which tasting and section the address points at (on a tasting's admin page) */
export function currentAdmin() {
  const m = location.pathname.match(/^\/t\/([a-z0-9-]+)\/admin\/(?:([a-z]+)\/?)?$/);
  if (!m) return null;
  const section = SECTIONS.find((s) => s.id === m[2]) ?? SECTIONS[0];
  return { slug: m[1], section: section.id };
}

type Row = { id: string; slug: string; title: string; starts_at: string | null };
/** My part in a tasting; shared: I co-host it on an account I am not on */
export type TastingRole = { tasting_id: string; hosting: boolean; can_manage: boolean; tenant_id: string; shared: boolean; slug: string };




/** Marks the current section in the menu (also after switching section without reloading) */
export function markSection(section: string) {
  document.querySelectorAll<HTMLAnchorElement>('#admin-side [data-section]').forEach((a) => {
    if (a.dataset.section === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  setSideOpen(false);
}

function tastingItem(r: Row, current: ReturnType<typeof currentAdmin>, hosting: Set<string>) {
  const li = mk('li');
  const a = mk('a', '', r.title);
  // The tastings I host myself are marked (the account may have many); the mark keeps to the last word
  if (hosting.has(r.id)) {
    a.classList.add('mine');
    const cut = r.title.lastIndexOf(' ') + 1;
    a.textContent = r.title.slice(0, cut);
    a.append(mk('span', 'sm-last', r.title.slice(cut)));
    a.querySelector('.sm-last')!.append(badge(null, 'mark'));
    tooltip(a, t('roles.youHost'));
  }
  a.href = adminUrl(r.slug);
  li.append(a);
  // The tasting's sections are tabs in the bar at the top; here it is only marked
  if (current?.slug === r.slug) {
    a.setAttribute('aria-current', 'page');
  }
  return li;
}

export async function initSide(email: string, onSignOut: () => void, workspaces: Workspace[]) {
  initSideMenu(email, onSignOut);
  // On more than one account: the choice at the top; switching shows that account's admin
  sideSwitcher(workspaces.map((w) => ({ value: w.id, label: workspaceLabel(w), hint: w.role === 'owner' ? t('account.owner') : t('account.host') })),
    currentWorkspace() ?? '', switchWorkspace);
  const roles = await tastingRoles();
  const here = visibleRoles(roles);
  const hosting = new Set(roles.filter((x) => x.hosting).map((x) => x.tasting_id));
  const { data } = await supabase.from('tastings').select('id, slug, title, starts_at')
    .in('id', here.map((x) => x.tasting_id)).order('starts_at', { ascending: true, nullsFirst: false });
  const all = (data ?? []) as Row[];
  const sharedIds = new Set(here.filter((x) => x.shared).map((x) => x.tasting_id));
  const rows = all.filter((r) => !sharedIds.has(r.id));
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const isPast = (r: Row) => !!r.starts_at && new Date(r.starts_at).getTime() < cutoff;
  const current = currentAdmin();
  $('side-tastings').replaceChildren(...rows.filter((r) => !isPast(r)).map((r) => tastingItem(r, current, hosting)));
  const past = rows.filter(isPast).reverse();
  $('side-past').hidden = past.length === 0;
  $('side-past-list').replaceChildren(...past.map((r) => tastingItem(r, current, hosting)));
  if (current && past.some((r) => r.slug === current.slug)) ($('side-past') as HTMLDetailsElement).open = true;
  // Shared with me: upcoming first, then past ones (latest first)
  const shared = all.filter((r) => sharedIds.has(r.id));
  $('side-shared-g').hidden = shared.length === 0;
  $('side-shared').replaceChildren(...[...shared.filter((r) => !isPast(r)), ...shared.filter(isPast).reverse()].map((r) => tastingItem(r, current, hosting)));

  if (current) markSection(current.section);
}

/** Shows another of my accounts: remembered on this device; a tasting of the old account gives way to the overview */
export function switchWorkspace(id: string) {
  if (id === currentWorkspace()) return;
  rememberWorkspace(id);
  if (currentAdmin()) location.href = '/admin/';
  else location.reload();
}

/** The tastings to show: those of the chosen account, and those shared with me (whatever account is chosen) */
export function visibleRoles(roles: TastingRole[]) {
  const ws = currentWorkspace();
  return roles.filter((x) => x.shared || x.tenant_id === ws);
}

/** Every tasting of my accounts (and those I co-host on accounts I am not on), with my part in each. */
let rolesOnce: Promise<TastingRole[]> | null = null;
export function tastingRoles(): Promise<TastingRole[]> {
  return (rolesOnce ??= Promise.resolve(supabase.rpc('my_tasting_roles')).then(({ data }) =>
    ((data ?? []) as TastingRole[]).map((x) => ({ ...x, hosting: !!x.hosting, can_manage: !!x.can_manage, shared: !!x.shared }))));
}
