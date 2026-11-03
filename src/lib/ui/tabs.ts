// Component 42 – the one tab bar (Tabs.astro builds the markup). tabs() wires a bar of buttons (role="tab"): a click
// or Enter chooses one, ← → Home End move between them (roving tabindex), onChange gets the chosen id. A bar of links
// (switching pages) gets the same arrow keys; selectTab() marks the current one (also after switching without reloading).

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
  }
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

/** The number after a tab's name ("Coming 14") */
export function setTabCount(tab: HTMLElement, count: number | string | null) {
  let n = tab.querySelector<HTMLElement>('.n');
  if (count == null) { n?.remove(); return; }
  if (!n) { n = document.createElement('span'); n.className = 'n'; tab.append(n); }
  n.textContent = String(count);
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

/** Every static tab bar of buttons on the page */
export function initTabs(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-tabs]').forEach((bar) => tabs(bar));
}
