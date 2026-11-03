// Component 34 – empty state: what an empty list or area says, always with a way forward (a button) where there is
// one. src/components/ui/EmptyState.astro gives the same markup for static ones.
import { iconSvg, type IconName } from './icons';

export interface EmptyAction { label: string; href?: string; onClick?: () => void; secondary?: boolean; id?: string; icon?: IconName }
export interface EmptyOptions { icon?: IconName; title: string; text?: string; action?: EmptyAction; actions?: EmptyAction[] }

function actionEl(a: EmptyAction): HTMLElement {
  const b = a.href ? Object.assign(document.createElement('a'), { href: a.href }) : Object.assign(document.createElement('button'), { type: 'button' });
  b.className = 'btn small' + (a.secondary ? ' secondary' : '');
  if (a.id) b.id = a.id;
  if (a.icon) b.innerHTML = iconSvg(a.icon);
  b.append(Object.assign(document.createElement('span'), { textContent: a.label }));
  if (a.onClick) b.addEventListener('click', a.onClick);
  return b;
}

/** Fills an .empty-state box (from EmptyState.astro or emptyState()) and shows it */
export function setEmpty(el: HTMLElement, o: EmptyOptions) {
  el.classList.add('empty-state');
  el.replaceChildren();
  if (o.icon) el.insertAdjacentHTML('beforeend', `<span class="e-ic" aria-hidden="true">${iconSvg(o.icon)}</span>`);
  el.append(Object.assign(document.createElement('p'), { className: 'e-title', textContent: o.title }));
  if (o.text) el.append(Object.assign(document.createElement('p'), { className: 'help', textContent: o.text }));
  const acts = [...(o.action ? [o.action] : []), ...(o.actions ?? [])];
  if (acts.length) {
    const row = document.createElement('div');
    row.className = 'e-actions';
    row.append(...acts.map(actionEl));
    el.append(row);
  }
  el.hidden = false;
}

/** A new empty state */
export function emptyState(o: EmptyOptions): HTMLElement {
  const el = document.createElement('div');
  setEmpty(el, o);
  return el;
}
