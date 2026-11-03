// Component 22 – the one facts list: label and value side by side (<dl class="facts">), an optional icon before the
// label. Used for a wine's grapes, food and serving and its details, a tasting's details on the host's overview,
// the wine page in the library and the payment box (values with a copy button). An empty value is left out –
// never a "–". Static markup: src/components/ui/Facts.astro gives the same list.
import { iconSvg, type IconName } from './icons';
import { iconButton } from './icon-button';
import { copyText } from './copy';
import { mk } from './dom';

export interface Fact {
  label: string;
  value: string | Node | null | undefined;
  icon?: IconName;
  /** A copy button after the value: what is copied and what the toast says */
  copy?: { text: string; label: string; done: string };
}

/** The list, or null when no fact has a value */
export function facts(items: Fact[], cls = ''): HTMLDListElement | null {
  const dl = mk('dl', 'facts' + (cls ? ' ' + cls : ''));
  fillFacts(dl, items);
  return dl.childElementCount ? dl : null;
}

/** Fills an existing list (replaces what is in it) */
export function fillFacts(dl: HTMLElement, items: Fact[]) {
  dl.replaceChildren();
  for (const f of items) {
    const v = typeof f.value === 'string' ? f.value.trim() : f.value;
    if (v == null || v === '') continue;
    const dd = mk('dd');
    if (f.label) {
      const dt = mk('dt');
      if (f.icon) dt.insertAdjacentHTML('beforeend', iconSvg(f.icon));
      dt.append(f.label);
      dl.append(dt);
    } else dd.className = 'full';
    if (f.copy) {
      const span = mk('span');
      span.append(v);
      const b = iconButton('copy', f.copy.label);
      const { text, done } = f.copy;
      b.addEventListener('click', () => copyText(text, done));
      dd.append(span, b);
    } else dd.append(v);
    dl.append(dd);
  }
}

/** A value in a static list (Facts.astro): set it, or hide the pair when it is empty */
export function setFact(dd: HTMLElement, value: string | null | undefined) {
  const v = value?.trim() ?? '';
  dd.textContent = v;
  dd.hidden = !v;
  const dt = dd.previousElementSibling;
  if (dt instanceof HTMLElement && dt.tagName === 'DT') dt.hidden = !v;
}
