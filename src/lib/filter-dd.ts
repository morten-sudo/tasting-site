// The one filter drop-down in the admin: a button that says what is shown, and under it a list of checkboxes with a
// count each. "All" first: ticking it ticks everything; clearing one item clears "All". Used by the wine list and the
// tasting's guest list (same markup and styles: .filter-dd, .filter-dd-btn, .filter-dd-menu).
import { t } from '../i18n';

export interface DdOption { value: string; label: string; n: number; sep?: boolean }

const CHEVRON = '<svg class="filter-dd-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>';
let uid = 0;
/** Nothing ticked (also "All" cleared): no rows are shown. */
export const NONE = '-';

/** A drop-down filter. The choice is a Set of values; an empty Set means "All" (no filter), {NONE} that nothing is ticked. */
export function filterDropdown(opts: { name: string; allLabel: string; onChange: (chosen: Set<string>) => void }) {
  const id = `fdd-${++uid}`;
  const root = document.createElement('div');
  root.className = 'filter-dd';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn small secondary filter-dd-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', id);
  btn.setAttribute('aria-label', opts.name);
  const label = document.createElement('span');
  btn.append(label);
  btn.insertAdjacentHTML('beforeend', CHEVRON);
  const menu = document.createElement('div');
  menu.className = 'filter-dd-menu';
  menu.id = id;
  menu.hidden = true;
  root.append(btn, menu);

  let chosen = new Set<string>();
  let values: string[] = [];
  const show = (open: boolean) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => show(!!menu.hidden));
  document.addEventListener('click', (e) => { if (!menu.hidden && !root.contains(e.target as Node)) show(false); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { show(false); btn.focus(); } });

  function row(value: string, text: string, n: number | null, checked: boolean, cls = '') {
    const l = document.createElement('label');
    if (cls) l.className = cls;
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', value, checked });
    const name = Object.assign(document.createElement('span'), { textContent: text });
    const small = Object.assign(document.createElement('small'), { textContent: n == null ? '' : String(n) });
    l.append(box, name, small);
    box.addEventListener('change', () => {
      // "All" ticks everything – or clears everything
      if (value === '') chosen = box.checked ? new Set() : new Set([NONE]);
      else {
        // From "All", clearing one keeps the others; ticking the last one is "All" again
        const now = chosen.size ? new Set(chosen) : new Set(values);
        now.delete(NONE);
        if (box.checked) now.add(value); else now.delete(value);
        chosen = values.every((v) => now.has(v)) ? new Set() : now.size ? now : new Set([NONE]);
      }
      opts.onChange(new Set(chosen));
    });
    return l;
  }

  return {
    el: root,
    /** Draws the list and the button. A chosen value that no wine or guest has any more stays (with 0), so it can be undone. */
    render(list: DdOption[], current: Set<string>, total: number) {
      chosen = new Set(current);
      const all = [...list];
      for (const v of chosen) if (v !== NONE && !all.some((o) => o.value === v)) all.unshift({ value: v, label: v, n: 0 });
      values = all.map((o) => o.value);
      const none = chosen.size === 0;
      menu.replaceChildren(row('', opts.allLabel, total, none, 'filter-all'));
      for (const o of all) {
        if (o.sep) menu.append(document.createElement('hr'));
        menu.append(row(o.value, o.label, o.n, none || chosen.has(o.value)));
      }
      const names = all.filter((o) => chosen.has(o.value)).map((o) => o.label);
      label.textContent = none ? opts.allLabel : !names.length ? t('guestFilter.none') : names.length === 1 ? names[0] : t('guestFilter.chosen', { n: names.length });
      btn.title = none ? '' : names.join(', ');
      btn.classList.toggle('on', !none);
    },
    close: () => show(false),
  };
}
