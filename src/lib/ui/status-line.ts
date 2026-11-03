// Component 33 – status line: one line for everything that works in the background ("Reading the label …",
// "✓ Found Kopke 10 Years", "Could not read the picture"). busy = the one spinner; info / ok / warn / error = an icon.
import { iconSvg } from './icons';

export type StatusState = 'busy' | 'info' | 'ok' | 'warn' | 'error';

/** Sets the line (a <p class="status">); null or an empty text hides it */
export function setStatus(el: HTMLElement, state: StatusState | null, text = '') {
  if (!state || !text) { el.hidden = true; el.replaceChildren(); el.removeAttribute('aria-busy'); return; }
  el.className = el.className.replace(/\b(status|ok|warn|err)\b/g, '').trim();
  el.classList.add('status');
  if (state === 'ok') el.classList.add('ok');
  if (state === 'warn') el.classList.add('warn');
  if (state === 'error') el.classList.add('err');
  if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
  el.toggleAttribute('aria-busy', state === 'busy');
  el.innerHTML = state === 'busy' ? '<span class="spin" aria-hidden="true"></span>' : iconSvg(state === 'ok' ? 'check' : state === 'info' ? 'info' : 'warn');
  el.append(Object.assign(document.createElement('span'), { textContent: text }));
  el.hidden = false;
}

/** A new, hidden status line */
export function statusLine(id?: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'status';
  if (id) p.id = id;
  p.setAttribute('aria-live', 'polite');
  p.hidden = true;
  return p;
}
