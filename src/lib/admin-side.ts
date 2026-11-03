// The admin menu on the left: the host's tastings (the tasting's own sections are tabs in the bar at the top),
// the libraries and settings. On phones the same menu opens as a drawer.
import { supabase } from './supabase';
import { t, type Key } from '../i18n';
import { tooltip } from './ui/tooltip';

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
export type TastingRole = { tasting_id: string; hosting: boolean; can_manage: boolean };

const $ = (id: string) => document.getElementById(id) as HTMLElement;
function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function setOpen(on: boolean) {
  $('admin-side').classList.toggle('open', on);
  $('side-backdrop').hidden = !on;
  $('side-open').setAttribute('aria-expanded', String(on));
  document.documentElement.classList.toggle('side-locked', on);
}

/** Marks the current section in the menu (also after switching section without reloading) */
export function markSection(section: string) {
  document.querySelectorAll<HTMLAnchorElement>('#admin-side [data-section]').forEach((a) => {
    if (a.dataset.section === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  setOpen(false);
}

function tastingItem(r: Row, current: ReturnType<typeof currentAdmin>, hosting: Set<string>) {
  const li = mk('li');
  const a = mk('a', '', r.title);
  // The tastings I host myself are marked (the account may have many)
  if (hosting.has(r.id)) {
    a.classList.add('mine');
    tooltip(a, t('roles.youHost'));
  }
  a.href = adminUrl(r.slug);
  li.append(a);
  // The tasting's sections are tabs in the bar at the top; here it is only marked
  if (current?.slug === r.slug) {
    li.className = 'current';
    a.setAttribute('aria-current', 'page');
  }
  return li;
}

export async function initSide(hostId: string) {
  $('admin-side').hidden = false;
  // The menu sticks just below the site header on larger screens
  const header = document.querySelector<HTMLElement>('.site-header');
  if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  $('side-open').hidden = false;
  $('side-open').addEventListener('click', () => setOpen(true));
  $('side-close').addEventListener('click', () => setOpen(false));
  $('side-backdrop').addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  const roles = await tastingRoles();
  const ids = roles.map((x) => x.tasting_id);
  const hosting = new Set(roles.filter((x) => x.hosting).map((x) => x.tasting_id));
  const { data } = await supabase.from('tastings').select('id, slug, title, starts_at')
    .in('id', ids).order('starts_at', { ascending: true, nullsFirst: false });
  const rows = (data ?? []) as Row[];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const isPast = (r: Row) => !!r.starts_at && new Date(r.starts_at).getTime() < cutoff;
  const current = currentAdmin();
  $('side-tastings').replaceChildren(...rows.filter((r) => !isPast(r)).map((r) => tastingItem(r, current, hosting)));
  const past = rows.filter(isPast).reverse();
  $('side-past').hidden = past.length === 0;
  $('side-past-list').replaceChildren(...past.map((r) => tastingItem(r, current, hosting)));
  if (current && past.some((r) => r.slug === current.slug)) ($('side-past') as HTMLDetailsElement).open = true;

  if (current) markSection(current.section);

}

/** The account's tastings (and those I co-host on other accounts), with my part in each. */
let rolesOnce: Promise<TastingRole[]> | null = null;
export function tastingRoles(): Promise<TastingRole[]> {
  return (rolesOnce ??= supabase.rpc('my_tasting_roles').then(({ data }) =>
    ((data ?? []) as TastingRole[]).map((x) => ({ ...x, hosting: !!x.hosting, can_manage: !!x.can_manage }))));
}
