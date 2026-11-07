// Component 42 – the one tab bar (Tabs.astro builds the markup). tabs() wires a bar of buttons (role="tab"): a click
// or Enter chooses one, ← → Home End move between them (roving tabindex), onChange gets the chosen id. A bar of links
// (switching pages) gets the same arrow keys; selectTab() marks the current one (also after switching without reloading).

import { badge } from './badge';

export interface TabsOptions { onChange?: (id: string) => void }

const items = (bar: HTMLElement) => [...bar.querySelectorAll<HTMLElement>(':scope > [data-tab]')].filter((b) => !b.hidden);

/** Marks the tab with this id as the chosen one */
export function selectTab(bar: HTMLElement, id: string) {
  for (const b of bar.querySelectorAll<HTMLElement>(':scope > [data-tab]')) {
    const on = b.dataset.tab === id;
    if (b.tagName === 'A') {
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    } else {
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (on) showChosen(bar, b);
  }
}

/** On a phone the bar is one line that scrolls sideways. Each edge fades only while there are more tabs that way
 *  (.more-start / .more-end), so a tab cut off at the edge reads as "there is more" (WIN-323). Watched as the bar
 *  scrolls and as it or its tabs change size (a tab shown or hidden later, the language, the screen turned). */
function watchEdges(bar: HTMLElement) {
  if (bar.dataset.edges) return;
  bar.dataset.edges = '1';
  const update = () => {
    const over = bar.scrollWidth - bar.clientWidth > 1;
    bar.classList.toggle('more-start', over && bar.scrollLeft > 4);
    bar.classList.toggle('more-end', over && bar.scrollLeft < bar.scrollWidth - bar.clientWidth - 4);
  };
  bar.addEventListener('scroll', update, { passive: true });
  const ro = new ResizeObserver(update);
  ro.observe(bar);
  for (const b of bar.querySelectorAll(':scope > [data-tab]')) ro.observe(b);
  update();
}

/** The chosen tab is brought into view (the page itself does not move) – also when the bar is still hidden and gets
 *  its size later. */
function showChosen(bar: HTMLElement, b: HTMLElement) {
  watchEdges(bar);
  const go = () => {
    if (!bar.clientWidth || bar.scrollWidth <= bar.clientWidth) return false;
    const x = b.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft;
    // The whole tab in view with a little of the one before it, so it is clear the bar goes on both ways
    const right = x + b.offsetWidth + 40 - bar.clientWidth;
    bar.scrollLeft = Math.max(0, Math.max(right, Math.min(x - 40, bar.scrollLeft)));
    return true;
  };
  if (go() || bar.clientWidth) return;
  const ro = new ResizeObserver(() => { if (bar.clientWidth) { ro.disconnect(); go(); } });
  ro.observe(bar);
}

/** The id of the chosen tab */
export function currentTab(bar: HTMLElement): string | undefined {
  return bar.querySelector<HTMLElement>(':scope > [aria-selected="true"], :scope > [aria-current="page"]')?.dataset.tab;
}

/** A tab made in TypeScript: the same markup as Tabs.astro */
export function tabButton(id: string, label: string, count?: number | string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'tab');
  b.dataset.tab = id;
  b.setAttribute('aria-selected', 'false');
  b.tabIndex = -1;
  const l = document.createElement('span');
  l.textContent = label;
  b.append(l);
  if (count != null) setTabCount(b, count);
  return b;
}

/** A bar of tab buttons made in TypeScript: the same markup as Tabs.astro without links; wire it with tabs() */
export function tabBar(label: string, items: { id: string; label: string; count?: number | string }[] = []): HTMLDivElement {
  const bar = document.createElement('div');
  bar.className = 'tabs';
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', label);
  bar.dataset.tabs = '';
  bar.append(...items.map((it) => tabButton(it.id, it.label, it.count)));
  return bar;
}

/** The number after a tab's name ("Coming 14") */
export function setTabCount(tab: HTMLElement, count: number | string | null) {
  let n = tab.querySelector<HTMLElement>('.badge');
  if (count == null) { n?.remove(); return; }
  if (!n) { n = badge(null, 'neutral'); tab.append(n); }
  n.textContent = String(count);
  n.hidden = false;
}

const handlers = new WeakMap<HTMLElement, ((id: string) => void)[]>();

export function tabs(bar: HTMLElement, opts: TabsOptions = {}) {
  // Bound once (Base.astro binds every static bar); a page adds its onChange whenever it runs
  const list = handlers.get(bar);
  if (list) { if (opts.onChange) list.push(opts.onChange); return; }
  const fns: ((id: string) => void)[] = opts.onChange ? [opts.onChange] : [];
  handlers.set(bar, fns);
  const changed = (id: string) => fns.forEach((f) => f(id));
  const isLinks = bar.tagName === 'NAV';
  bar.addEventListener('click', (e) => {
    if (isLinks) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!b || b.parentElement !== bar) return;
    selectTab(bar, b.dataset.tab!);
    changed(b.dataset.tab!);
  });
  bar.addEventListener('keydown', (e) => {
    const all = items(bar);
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const to = e.key === 'ArrowRight' ? (i + 1) % all.length : e.key === 'ArrowLeft' ? (i - 1 + all.length) % all.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    all[to].focus();
    // Buttons follow the focus (automatic activation); links are followed with Enter
    if (!isLinks) { selectTab(bar, all[to].dataset.tab!); changed(all[to].dataset.tab!); }
  });
}

/** Every static tab bar on the page: wired, the edges watched, and the chosen tab in view (also a bar of links,
 *  e.g. a tasting's tabs, so the last tab is not left cut off on a phone – WIN-323) */
export function initTabs(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-tabs]').forEach((bar) => {
    tabs(bar);
    watchEdges(bar);
    const chosen = bar.querySelector<HTMLElement>(':scope > [aria-selected="true"], :scope > [aria-current="page"]');
    if (chosen) showChosen(bar, chosen);
  });
}
