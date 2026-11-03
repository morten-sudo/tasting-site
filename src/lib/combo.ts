// Component 9 – combobox: a text field with suggestions (instead of the browser's own <datalist>, which cannot be
// styled and shows the same extra text on every line). Free text is still allowed; the list only helps. Arrow keys,
// Enter, Esc and clicking work; the list follows what is typed. The list is the one menu (.menu, .opt-i, .m-group).
import { normOrigin } from './origin';

export type ComboOption = { value: string; hint?: string; group?: string };

export function combo(input: HTMLInputElement, options: () => ComboOption[], onPick?: (value: string) => void) {
  const list = document.createElement('ul');
  list.className = 'menu';
  list.id = `${input.id}-list`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  input.replaceWith(wrap);
  wrap.append(input, list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('list');

  let shown: ComboOption[] = [];
  let active = -1;
  let typed = false; // filter only by what the person typed, not by a value just picked or filled in

  function open() {
    const q = typed ? normOrigin(input.value) : '';
    const all = options();
    // Starts-with first, then contains; at most 80 lines
    const hit = (o: ComboOption) => normOrigin(o.value);
    shown = q
      ? [...all.filter((o) => hit(o).startsWith(q)), ...all.filter((o) => !hit(o).startsWith(q) && hit(o).includes(q))].slice(0, 80)
      : all.slice(0, 80);
    if (!shown.length || (shown.length === 1 && shown[0].value === input.value.trim())) { close(); return; }
    active = -1;
    let group: string | undefined;
    list.replaceChildren(...shown.flatMap((o, i) => {
      const out: HTMLElement[] = [];
      if (!q && o.group && o.group !== group) {
        group = o.group;
        const g = document.createElement('li');
        g.className = 'm-group';
        g.setAttribute('role', 'presentation');
        g.textContent = o.group;
        out.push(g);
      }
      const li = document.createElement('li');
      li.id = `${list.id}-${i}`;
      li.setAttribute('role', 'option');
      li.className = 'opt-i';
      li.setAttribute('aria-selected', 'false');
      const b = document.createElement('span');
      b.textContent = o.value;
      li.append(b);
      if (o.hint) {
        const h = document.createElement('small');
        h.textContent = o.hint;
        li.append(h);
      }
      // mousedown so the field does not lose focus before the pick
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
      out.push(li);
      return out;
    }));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function close() {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function pick(i: number) {
    const o = shown[i];
    if (!o) return;
    input.value = o.value;
    typed = false;
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    onPick?.(o.value);
  }
  function move(d: number) {
    if (list.hidden) { open(); return; }
    active = (active + d + shown.length) % shown.length;
    list.querySelectorAll('.opt-i').forEach((li, i) => { li.setAttribute('aria-selected', String(i === active)); li.toggleAttribute('data-active', i === active); });
    const li = list.querySelector<HTMLElement>(`#${list.id}-${active}`);
    li?.scrollIntoView({ block: 'nearest' });
    if (li) input.setAttribute('aria-activedescendant', li.id);
  }

  input.addEventListener('input', (e) => { if (e.isTrusted) { typed = true; open(); } });
  input.addEventListener('focus', () => { typed = false; open(); });
  input.addEventListener('click', () => { if (list.hidden) open(); });
  input.addEventListener('blur', () => close());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
  });
  return { refresh: () => { if (!list.hidden) open(); }, close };
}
