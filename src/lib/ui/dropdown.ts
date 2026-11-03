// Component 7 – dropdown, one choice: a button that says what is chosen and opens a menu with a check by the chosen
// item (the one menu, menu.ts). Used everywhere a choice is made from a list – also in forms (type, country), so the
// site has no native <select>. Long lists get a search field at the top. Keys: ↓/↑/Enter open, ↓/↑/Home/End move,
// Enter picks, Esc closes, typing jumps to an item (or searches).
// The box (.dd) behaves like a <select> for form code: el.value (get/set), el.disabled, and a "change" event.
// src/components/ui/Dropdown.astro gives the same markup; dropdownFrom() / getDropdown(id) connect it.
import { t } from '../../i18n';
import { iconSvg } from './icons';
import { bindMenu, type MenuHandle } from './menu';

export interface DdOption { value: string; label: string; hint?: string; lead?: string; lang?: string }
export interface Dropdown {
  el: DropdownEl;
  button: HTMLButtonElement;
  value: string;
  disabled: boolean;
  setOptions: (list: DdOption[], value?: string) => void;
  options: () => DdOption[];
  label: () => string;
  open: () => void;
}
/** The .dd box, usable like a <select> */
export type DropdownEl = HTMLDivElement & { value: string; disabled: boolean };

export interface DropdownOptions {
  options?: DdOption[];
  value?: string;
  /** Shown (greyed) while nothing is chosen */
  placeholder?: string;
  /** A search field at the top; default: when there are more than 12 items */
  search?: boolean;
  searchLabel?: string;
  /** Before the chosen label on the button ("Sort: ") */
  prefix?: string;
  /** The name read out for the button when no <label> points at it */
  ariaLabel?: string;
  small?: boolean;
  full?: boolean;
  right?: boolean;
  id?: string;
  onChange?: (value: string) => void;
}

const controllers = new WeakMap<HTMLElement, { api: Dropdown; cfg: DropdownOptions; refresh: () => void }>();

/** The markup (also produced by Dropdown.astro): .dd > button.dd-btn + .menu[role=listbox] */
function shell(o: DropdownOptions): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'dd' + (o.full ? ' full' : '');
  root.dataset.dd = '';
  if (o.id) root.id = o.id;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn' + (o.small ? ' small' : '');
  if (o.id) btn.id = `${o.id}-btn`;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.innerHTML = `<span class="dd-val"></span>${iconSvg('chev', 'chev')}`;
  const menu = document.createElement('div');
  menu.className = 'menu' + (o.right ? ' right' : '');
  menu.hidden = true;
  menu.innerHTML = '<div class="m-list" role="listbox"></div><div class="m-empty" hidden></div>';
  root.append(btn, menu);
  return root;
}

/** A new dropdown */
export function dropdown(o: DropdownOptions): Dropdown {
  return dropdownFrom(shell(o), o);
}

/** The dropdown for a .dd box already in the page (from Dropdown.astro), connected once */
export function getDropdown(id: string, o: DropdownOptions = {}): Dropdown {
  const root = document.getElementById(id);
  if (!root) throw new Error(`No dropdown #${id}`);
  return dropdownFrom(root as HTMLDivElement, o);
}

export function dropdownFrom(root: HTMLElement, o: DropdownOptions = {}): Dropdown {
  // Connected already (Base.astro connects every static one): take the new settings
  const known = controllers.get(root);
  if (known) {
    const { onChange, options, value: v, ...rest } = o;
    Object.assign(known.cfg, rest);
    if (onChange) root.addEventListener('change', () => onChange(known.api.value));
    if (options) known.api.setOptions(options, v ?? known.api.value);
    else known.refresh();
    return known.api;
  }
  o = { ...o };
  const btn = root.querySelector<HTMLButtonElement>(':scope > .dd-btn')!;
  const menu = root.querySelector<HTMLElement>(':scope > .menu')!;
  const list = menu.querySelector<HTMLElement>('.m-list')!;
  const empty = menu.querySelector<HTMLElement>('.m-empty')!;
  const valBox = btn.querySelector<HTMLElement>('.dd-val')!;
  const placeholder = () => o.placeholder ?? root.dataset.placeholder ?? t('dd.choose');
  const prefix = () => o.prefix ?? root.dataset.prefix ?? '';
  list.id ||= `${root.id || 'dd'}-list-${Math.random().toString(36).slice(2, 7)}`;

  // The options: given, or read from the static markup
  let opts: DdOption[] = o.options ?? [...list.querySelectorAll<HTMLElement>('.opt-i')].map((b) => ({ value: b.dataset.value ?? '', label: b.textContent?.trim() ?? '' }));
  let value = o.value ?? root.dataset.value ?? list.querySelector<HTMLElement>('.opt-i[aria-selected="true"]')?.dataset.value ?? '';
  let search: HTMLInputElement | null = null;
  let handle: MenuHandle;

  function paintButton() {
    const cur = opts.find((x) => x.value === value);
    valBox.replaceChildren();
    if (cur) {
      if (cur.lead) valBox.insertAdjacentHTML('beforeend', cur.lead);
      valBox.append(Object.assign(document.createElement('span'), { textContent: prefix() + cur.label }));
    } else valBox.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: placeholder() }));
    if (o.ariaLabel) btn.setAttribute('aria-label', o.ariaLabel);
    btn.title = cur ? cur.label : '';
  }
  function renderList() {
    const wantSearch = o.search ?? (root.dataset.search !== undefined || opts.length > 12);
    if (wantSearch && !search) {
      const box = document.createElement('div');
      box.className = 'm-search';
      box.innerHTML = `<div class="affix pre"><span class="pre-i">${iconSvg('search')}</span><input class="input small" type="search" autocomplete="off" /></div>`;
      search = box.querySelector('input')!;
      search.placeholder = o.searchLabel ?? t('dd.search');
      search.setAttribute('aria-label', o.searchLabel ?? t('dd.search'));
      search.setAttribute('aria-controls', list.id);
      search.addEventListener('input', filter);
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); visibleItems()[0]?.click(); }
      });
      menu.prepend(box);
    }
    list.replaceChildren(...opts.map((x) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt-i';
      b.setAttribute('role', 'option');
      b.dataset.value = x.value;
      b.setAttribute('aria-selected', String(x.value === value));
      b.innerHTML = iconSvg('check', 'ck') + (x.lead ?? '');
      const label = Object.assign(document.createElement('span'), { textContent: x.label });
      if (x.lang) b.lang = x.lang;
      if (x.hint) {
        const txt = Object.assign(document.createElement('span'), { className: 'opt-txt' });
        txt.append(label, Object.assign(document.createElement('small'), { textContent: x.hint }));
        b.append(txt);
      } else b.append(label);
      b.addEventListener('click', () => { pick(x.value); handle.close(); });
      return b;
    }));
  }
  const visibleItems = () => [...list.querySelectorAll<HTMLElement>('.opt-i:not([hidden])')];
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function filter() {
    const q = fold(search?.value.trim() ?? '');
    let n = 0;
    list.querySelectorAll<HTMLElement>('.opt-i').forEach((b) => {
      const hit = !q || fold(b.textContent ?? '').includes(q);
      b.hidden = !hit;
      if (hit) n++;
    });
    empty.textContent = t('dd.noMatch');
    empty.hidden = n > 0;
  }
  function pick(v: string, fire = true) {
    const changed = v !== value;
    value = v;
    list.querySelectorAll<HTMLElement>('.opt-i').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.value === v)));
    paintButton();
    if (changed && fire) {
      root.dispatchEvent(new Event('change', { bubbles: true }));
      o.onChange?.(v);
    }
  }

  renderList();
  paintButton();
  handle = bindMenu(btn, menu, {
    items: '.m-list .opt-i',
    focusOnOpen: () => search ?? undefined,
    onOpen: () => { if (search) { search.value = ''; filter(); } list.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); },
  });
  // Closed: typing on the button picks the next item that starts with the letter (as a <select> does)
  let typed = '';
  let typedAt = 0;
  btn.addEventListener('keydown', (e) => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.key === ' ' || !menu.hidden) return;
    if (search) { e.preventDefault(); handle.open(); search.value = e.key; filter(); return; }
    const now = Date.now();
    typed = now - typedAt > 700 ? fold(e.key) : typed + fold(e.key);
    typedAt = now;
    const i = opts.findIndex((x) => x.value === value);
    const order = [...opts.slice(i + 1), ...opts.slice(0, i + 1)];
    const hit = (typed.length > 1 ? opts : order).find((x) => fold(x.label).startsWith(typed));
    if (hit) pick(hit.value);
  });

  const api: Dropdown = {
    el: root as DropdownEl,
    button: btn,
    get value() { return value; },
    set value(v: string) { pick(v, false); },
    get disabled() { return btn.disabled; },
    set disabled(on: boolean) { btn.disabled = on; if (on) handle.close(false); },
    setOptions(list2, v) { opts = list2; if (v !== undefined) value = v; renderList(); paintButton(); },
    options: () => opts,
    label: () => opts.find((x) => x.value === value)?.label ?? '',
    open: () => handle.open(),
  };
  // Form code can treat the box as a <select>
  Object.defineProperty(root, 'value', { get: () => value, set: (v: string) => pick(v, false), configurable: true });
  Object.defineProperty(root, 'disabled', { get: () => btn.disabled, set: (on: boolean) => { api.disabled = on; }, configurable: true });
  // A <label for="…-btn"> names the button; aria-invalid on the box marks the button
  new MutationObserver(() => {
    for (const a of ['aria-invalid', 'aria-describedby']) {
      const v = root.getAttribute(a);
      if (v == null) btn.removeAttribute(a); else btn.setAttribute(a, v);
    }
  }).observe(root, { attributes: true, attributeFilter: ['aria-invalid', 'aria-describedby'] });
  // focusField(box) focuses the button
  root.focus = (opts?: FocusOptions) => btn.focus(opts);
  controllers.set(root, { api, cfg: o, refresh: () => { renderList(); paintButton(); } });
  return api;
}

/** Connects every static dropdown in the page that is not yet connected */
export function initDropdowns(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('.dd[data-dd]').forEach((el) => { if (!controllers.has(el)) dropdownFrom(el); });
}
