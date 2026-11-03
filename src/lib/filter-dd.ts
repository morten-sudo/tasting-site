// Component 8 – the one filter menu: a small button with the filter icon that says what is shown and how many
// ("All · 22", "Coming · 9", "2 chosen · 11"), and the one menu (menu.ts) under it with a checkbox and a count per
// item. "All" first: ticking it ticks everything; clearing one item clears "All". An extra item after a line
// ("Missing email") narrows the chosen ones on its own. single: one choice (radio-like items with a check), e.g.
// "I host / All". Used by the wine library, a tasting's guest list and the tastings list.
import { t } from '../i18n';
import { badge } from './ui/badge';
import { iconSvg } from './ui/icons';
import { bindMenu, type MenuHandle } from './ui/menu';
import { tooltip } from './ui/tooltip';

export interface DdOption { value: string; label: string; n: number; sep?: boolean; extra?: boolean }

let uid = 0;
/** Nothing ticked (also "All" cleared): no rows are shown. */
export const NONE = '-';

export interface FilterOptions {
  /** What is filtered, read out for the button ("Guests") */
  name: string;
  allLabel?: string;
  /** Shorter word for "All" where the buttons are narrow (the wine library's four filters on a phone): "Countries" */
  allShort?: string;
  single?: boolean;
  /** The choice is a Set of values; an empty Set means "All" (no filter), {NONE} that nothing is ticked.
   *  extras: the extra items that are ticked. Single: the Set holds the one value. */
  onChange: (chosen: Set<string>, extras: Set<string>) => void;
}

export function filterDropdown(opts: FilterOptions) {
  const id = `fdd-${++uid}`;
  const root = document.createElement('div');
  root.className = 'dd filter-dd';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn small';
  btn.setAttribute('aria-label', opts.name);
  btn.innerHTML = iconSvg('filter');
  const label = document.createElement('span');
  label.className = 'dd-val';
  btn.append(label);
  btn.insertAdjacentHTML('beforeend', iconSvg('chev', 'chev'));
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.id = id;
  menu.hidden = true;
  if (opts.single) menu.setAttribute('role', 'menu');
  root.append(btn, menu);
  const handle: MenuHandle = bindMenu(btn, menu);

  let chosen = new Set<string>();
  let extras = new Set<string>();
  let values: string[] = [];
  const fire = () => opts.onChange(new Set(chosen), new Set(extras));

  function row(value: string, text: string, n: number | null, checked: boolean, cls = '', extra = false) {
    const l = document.createElement('label');
    l.className = 'opt-i' + (cls ? ' ' + cls : '');
    l.tabIndex = -1;
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', value, checked, tabIndex: -1 });
    l.append(box, Object.assign(document.createElement('span'), { textContent: text }), badge(n, 'neutral'));
    box.addEventListener('change', () => {
      if (extra) { if (box.checked) extras.add(value); else extras.delete(value); fire(); return; }
      // "All" ticks everything – or clears everything
      if (value === '') chosen = box.checked ? new Set() : new Set([NONE]);
      else {
        // From "All", clearing one keeps the others; ticking the last one is "All" again
        const now = chosen.size ? new Set(chosen) : new Set(values);
        now.delete(NONE);
        if (box.checked) now.add(value); else now.delete(value);
        chosen = values.every((v) => now.has(v)) ? new Set() : now.size ? now : new Set([NONE]);
      }
      fire();
      // The menu is drawn again by the caller: keep the focus on the same item
      requestAnimationFrame(() => menu.querySelector<HTMLElement>(`input[value="${CSS.escape(value)}"]`)?.closest<HTMLElement>('label')?.focus());
    });
    return l;
  }
  function option(o: DdOption, on: boolean) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt-i';
    b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', String(on));
    b.innerHTML = iconSvg('check', 'ck');
    b.append(Object.assign(document.createElement('span'), { textContent: o.label }), badge(o.n, 'neutral'));
    b.addEventListener('click', () => { chosen = new Set([o.value]); handle.close(); fire(); });
    return b;
  }

  return {
    el: root,
    button: btn,
    /** Draws the list and the button. A chosen value that no wine or guest has any more stays (with 0), so it can be
     *  undone. shown: how many rows are shown (default: the chosen items' counts added up). */
    render(list: DdOption[], current: Set<string>, total: number, o: { extras?: Set<string>; shown?: number } = {}) {
      chosen = new Set(current);
      extras = new Set(o.extras ?? []);
      if (opts.single) {
        const cur = list.find((x) => chosen.has(x.value)) ?? list[0];
        menu.replaceChildren(...list.map((x) => option(x, x === cur)));
        label.textContent = cur ? `${cur.label} · ${cur.n}` : '';
        btn.classList.toggle('on', !!cur && cur !== list.at(-1));
        btn.disabled = list.length < 2;
        return;
      }
      const main = list.filter((x) => !x.extra);
      const extraOpts = list.filter((x) => x.extra);
      for (const v of chosen) if (v !== NONE && !main.some((x) => x.value === v)) main.unshift({ value: v, label: v, n: 0 });
      values = main.map((x) => x.value);
      const none = chosen.size === 0;
      menu.replaceChildren(row('', opts.allLabel ?? t('admin.fAll'), total, none, 'all'), document.createElement('hr'));
      for (const x of main) {
        if (x.sep) menu.append(document.createElement('hr'));
        menu.append(row(x.value, x.label, x.n, none || chosen.has(x.value)));
      }
      if (extraOpts.length) menu.append(document.createElement('hr'));
      for (const x of extraOpts) menu.append(row(x.value, x.label, x.n, extras.has(x.value), '', true));
      const names = [...(none ? [opts.allLabel ?? t('admin.fAll')] : main.filter((x) => chosen.has(x.value)).map((x) => x.label)),
        ...extraOpts.filter((x) => extras.has(x.value)).map((x) => x.label)];
      const shown = o.shown ?? (none ? total : main.filter((x) => chosen.has(x.value)).reduce((s, x) => s + x.n, 0));
      // One choice by name; several as "3 chosen" – the count always shows
      const what = !names.length || chosen.has(NONE) && !extras.size ? t('guestFilter.none') : names.length === 1 ? names[0] : t('guestFilter.chosen', { n: names.length });
      const short = none && !extras.size && opts.allShort ? opts.allShort : what;
      label.replaceChildren(Object.assign(document.createElement('span'), { className: 'dd-txt' }));
      const txt = label.firstElementChild!;
      txt.append(Object.assign(document.createElement('span'), { className: 'dd-long', textContent: `${what} · ${shown}` }),
        Object.assign(document.createElement('span'), { className: 'dd-short', textContent: short }));
      // Several chosen: their names as a tip
      tooltip(btn, none && !extras.size || names.length < 2 ? '' : names.join(', '));
      btn.classList.toggle('on', !none || extras.size > 0);
      btn.disabled = total === 0 && none && !extras.size;
    },
    close: () => handle.close(false),
  };
}
