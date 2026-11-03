// Components 7–9 – the one menu: a button that opens a list of items under it (.menu with .opt-i items, <hr>
// separators and .ck checks). Used by the dropdown (dropdown.ts), the filter (filter-dd.ts), the header's language
// and account menus and the tasting switcher (Base.astro). One menu is open at a time; it closes on a click outside,
// Esc (back to the button) and Tab. Keys: ↓/↑ (also from the button), Home/End, and typing jumps to an item.
import { iconSvg } from './icons';

export interface MenuOptions {
  /** The items that keys move between (default: .opt-i that are buttons, links or labels) */
  items?: string;
  /** What gets focus when it opens (default: the chosen item, else the first) */
  focusOnOpen?: () => HTMLElement | null | undefined;
  onOpen?: () => void;
  onClose?: () => void;
}
export interface MenuHandle { open: (focus?: boolean) => void; close: (refocus?: boolean) => void; isOpen: () => boolean; button: HTMLElement; menu: HTMLElement }

const open = new Set<MenuHandle>();
let wired = false;
function wireDocument() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    for (const m of [...open]) if (!m.menu.contains(e.target as Node) && !m.button.contains(e.target as Node)) m.close(false);
  });
}
/** Closes every open menu (e.g. before a panel opens) */
export const closeMenus = () => [...open].forEach((m) => m.close(false));

const visible = (el: HTMLElement) => !el.hidden && el.offsetParent !== null && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';

/** Connects a button and its menu. The menu element is moved nowhere; it must sit after the button in a positioned box. */
export function bindMenu(button: HTMLElement, menu: HTMLElement, opts: MenuOptions = {}): MenuHandle {
  wireDocument();
  const sel = opts.items ?? '.opt-i:is(button, a, label)';
  if (!menu.id) menu.id = `menu-${Math.random().toString(36).slice(2, 8)}`;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', menu.id);
  if (!button.hasAttribute('aria-haspopup')) button.setAttribute('aria-haspopup', 'true');
  const items = () => [...menu.querySelectorAll<HTMLElement>(sel)].filter(visible);

  const h: MenuHandle = {
    button, menu,
    isOpen: () => !menu.hidden,
    open(focus = true) {
      if (!menu.hidden) return;
      closeMenus();
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      open.add(h);
      opts.onOpen?.();
      if (focus) {
        const target = opts.focusOnOpen?.() ?? items().find((x) => x.matches('[aria-selected="true"], [aria-checked="true"], [aria-current]')) ?? items()[0];
        target?.focus({ preventScroll: true });
        target?.scrollIntoView?.({ block: 'nearest' });
      }
    },
    close(refocus = true) {
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      open.delete(h);
      opts.onClose?.();
      if (refocus) button.focus({ preventScroll: true });
    },
  };
  // Opened with a tap or click (detail > 0) the focus stays on the button – no focus ring on the first item;
  // opened with Enter or Space (detail 0) the focus moves into the menu as before
  button.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) h.open(e.detail === 0); else h.close(); });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); h.open(); if (e.key === 'ArrowUp') items().at(-1)?.focus(); }
  });

  let typed = '';
  let typedAt = 0;
  menu.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const inField = (e.target as HTMLElement).matches('input[type="search"], input[type="text"]');
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); h.close(); return; }
    if (e.key === 'Tab') { h.close(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); list[Math.min(i + 1, list.length - 1)]?.focus(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i <= 0) (menu.querySelector<HTMLElement>('.m-search input') ?? list[0])?.focus(); else list[i - 1].focus();
      return;
    }
    if (inField) return;
    if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); return; }
    if (e.key === 'End') { e.preventDefault(); list.at(-1)?.focus(); return; }
    // A label item (filter): Enter ticks it like Space
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).matches('label.opt-i')) { e.preventDefault(); (e.target as HTMLElement).click(); return; }
    // Typing jumps to the next item that starts with what was typed
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      const now = Date.now();
      typed = now - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
      typedAt = now;
      const from = typed.length === 1 ? i + 1 : Math.max(i, 0);
      const order = [...list.slice(from), ...list.slice(0, from)];
      order.find((x) => (x.textContent ?? '').trim().toLowerCase().startsWith(typed))?.focus();
    }
  });
  // Label items (checkboxes) can be reached with the keys
  menu.querySelectorAll<HTMLElement>('label.opt-i').forEach((l) => { if (!l.hasAttribute('tabindex')) l.tabIndex = -1; });
  return h;
}

/** One item: a button (or a link with href) with the check in front and the text */
export function menuItem(label: string, opts: { href?: string; role?: string; check?: boolean; selected?: boolean; small?: string; sub?: string; lead?: string; cls?: string } = {}): HTMLElement {
  const el = opts.href ? Object.assign(document.createElement('a'), { href: opts.href }) : Object.assign(document.createElement('button'), { type: 'button' });
  el.className = 'opt-i' + (opts.cls ? ' ' + opts.cls : '');
  if (opts.role) el.setAttribute('role', opts.role);
  if (opts.check) {
    el.insertAdjacentHTML('beforeend', iconSvg('check', 'ck'));
    if (opts.role === 'option') el.setAttribute('aria-selected', String(!!opts.selected));
    else if (opts.role === 'menuitemradio') el.setAttribute('aria-checked', String(!!opts.selected));
  }
  if (opts.lead) el.insertAdjacentHTML('beforeend', opts.lead);
  if (opts.sub) {
    const txt = document.createElement('span');
    txt.className = 'opt-txt';
    txt.append(Object.assign(document.createElement('span'), { textContent: label }), Object.assign(document.createElement('small'), { textContent: opts.sub }));
    el.append(txt);
  } else el.append(Object.assign(document.createElement('span'), { textContent: label }));
  if (opts.small != null) el.append(Object.assign(document.createElement('small'), { textContent: opts.small }));
  return el;
}

/** A heading inside a menu ("Switch tasting", "From your library") */
export function menuGroup(text: string, tag: 'div' | 'li' = 'div'): HTMLElement {
  const el = document.createElement(tag);
  el.className = 'm-group';
  el.setAttribute('role', 'presentation');
  el.textContent = text;
  return el;
}

/** A suggestion with its own button (a library wine with "Add", a guest with "Edit"): picture or initials, the name
 *  with a line under it, and the button on the right – in a .menu.static list */
export function menuHit(lead: Node, title: string | HTMLElement, sub: string | null, action: Node | null): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'opt-i hit';
  const txt = document.createElement('span');
  txt.className = 'opt-txt';
  txt.append(typeof title === 'string' ? Object.assign(document.createElement('span'), { className: 'opt-name', textContent: title }) : title);
  if (sub) txt.append(Object.assign(document.createElement('small'), { textContent: sub }));
  li.append(lead, txt);
  if (action) li.append(action);
  return li;
}
