// The admin menu on the left: the host's tastings (the current one with its sections),
// the libraries and settings. On phones the same menu opens as a drawer.
import { supabase } from './supabase';
import { t, type Key } from '../i18n';

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

type Row = { slug: string; title: string; starts_at: string | null };

const $ = (id: string) => document.getElementById(id) as HTMLElement;
function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function setOpen(on: boolean) {
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
  const cur = currentAdmin();
  const title = document.querySelector<HTMLElement>('#side-tastings .current > a')?.textContent;
  const label = SECTIONS.find((s) => s.id === section)?.label;
  if (cur && title && label) $('side-where').textContent = `${title} › ${t(label)}`;
  setOpen(false);
}

function tastingItem(r: Row, current: ReturnType<typeof currentAdmin>) {
  const li = mk('li');
  const a = mk('a', '', r.title);
  a.href = adminUrl(r.slug);
  li.append(a);
  if (current?.slug === r.slug) {
    li.className = 'current';
    const sub = mk('ul', 'side-sub');
    for (const s of SECTIONS) {
      const sa = mk('a', '', t(s.label));
      sa.href = adminUrl(r.slug, s.path);
      sa.dataset.section = s.id;
      const sli = mk('li');
      sli.append(sa);
      sub.append(sli);
    }
    li.append(sub);
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

  const { data } = await supabase.from('tastings').select('slug, title, starts_at')
    .eq('host_id', hostId).order('starts_at', { ascending: true, nullsFirst: false });
  const rows = (data ?? []) as Row[];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const isPast = (r: Row) => !!r.starts_at && new Date(r.starts_at).getTime() < cutoff;
  const current = currentAdmin();
  $('side-tastings').replaceChildren(...rows.filter((r) => !isPast(r)).map((r) => tastingItem(r, current)));
  const past = rows.filter(isPast).reverse();
  $('side-past').hidden = past.length === 0;
  $('side-past-list').replaceChildren(...past.map((r) => tastingItem(r, current)));
  if (current && past.some((r) => r.slug === current.slug)) ($('side-past') as HTMLDetailsElement).open = true;

  if (current) markSection(current.section);
  else {
    const a = document.querySelector<HTMLElement>('#admin-side a[aria-current="page"]');
    if (a?.textContent) $('side-where').textContent = a.textContent;
  }
}
