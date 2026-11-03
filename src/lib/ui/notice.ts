// Component 33 – notice: one message box in the page (info / warn / error / ok), with an optional title and actions.
// Not for form-field problems (fieldError() puts those under the field) and not for "Saved" (toast()).
// src/components/ui/Notice.astro gives the same markup for static notices.
import { iconSvg, type IconName } from './icons';

export type NoticeTone = 'info' | 'warn' | 'error' | 'ok';
export interface NoticeOptions {
  title?: string;
  text?: string;
  /** Nodes after the text (a link, buttons – put in an .actions row) */
  actions?: Node[];
  /** Extra nodes in the body, after the text */
  body?: Node[];
}

const ICON: Record<NoticeTone, IconName> = { info: 'info', warn: 'warn', error: 'warn', ok: 'check' };

function fill(el: HTMLElement, tone: NoticeTone, o: NoticeOptions) {
  el.className = el.className.replace(/\b(notice|info|warn|error|ok)\b/g, '').trim();
  el.classList.add('notice');
  if (tone !== 'info') el.classList.add(tone);
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  const body = document.createElement('div');
  body.className = 'n-body';
  if (o.title) body.append(Object.assign(document.createElement('b'), { className: 'n-title', textContent: o.title }));
  if (o.text) body.append(Object.assign(document.createElement('p'), { textContent: o.text }));
  if (o.body) body.append(...o.body);
  if (o.actions?.length) {
    const row = document.createElement('div');
    row.className = 'actions';
    row.append(...o.actions);
    body.append(row);
  }
  el.innerHTML = iconSvg(ICON[tone]);
  el.append(body);
}

/** A new notice */
export function notice(tone: NoticeTone, o: NoticeOptions): HTMLElement {
  const el = document.createElement('div');
  fill(el, tone, o);
  return el;
}

/** Shows a message in a notice that is in the page (Notice.astro), or hides it (null) */
export function setNotice(el: HTMLElement, text: string | null, tone: NoticeTone = 'info', o: Omit<NoticeOptions, 'text'> = {}) {
  if (text == null && !o.title) { el.hidden = true; return; }
  fill(el, tone, { ...o, text: text ?? undefined });
  el.hidden = false;
}
