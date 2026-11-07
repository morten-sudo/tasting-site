// Component 32 – toast: the only feedback after saving, deleting or copying – on every page, also for guests.
// Bottom centre, one at a time, 4 s (8 s with an action such as Undo), paused while the pointer or focus is on it,
// read out (role="status"). An error stays until it is closed.
import { closeButton } from './icon-button';
import { iconSvg } from './icons';
import { t } from '../../i18n';

type Action = { label: string; run: () => void } | { label: string; href: string };
export interface ToastOptions {
  action?: Action;
  /** 'error' (stays until closed) or 'ok' (the default) */
  kind?: 'ok' | 'error';
  error?: boolean;
  /** How long it stays (default 4 s, 8 s with an action) */
  duration?: number;
  /** Runs when the toast goes away by itself or is closed – not when its action is used */
  onTimeout?: () => void;
}

let current: { host: HTMLElement; el: HTMLElement; timer: number; done?: () => void; error?: boolean } | null = null;

// A toast shown while a panel is open lives in that dialog (the top layer); when the panel then closes – e.g.
// "Remove from the tasting" closes the panel right after the toast with Undo – the toast moves out with it
// instead of disappearing with the dialog. ('close' does not bubble, so it is caught on the way down.)
let movesWired = false;
function wireMoves() {
  if (movesWired) return;
  movesWired = true;
  document.addEventListener('close', (e) => {
    const d = e.target as HTMLElement;
    if (!current || !(d instanceof HTMLDialogElement) || !d.contains(current.host)) return;
    ([...document.querySelectorAll('dialog[open]')].filter((x) => x !== d).pop() ?? document.body).append(current.host);
  }, true);
}

export function toast(text: string, opts: ToastOptions = {}) {
  hideToast();
  wireMoves();
  const error = opts.error || opts.kind === 'error';
  const host = document.createElement('div');
  host.className = 'toast-host';
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = iconSvg(error ? 'warn' : 'check', 't-ic');
  // The text goes in just after the live region is in the page: a region that arrives with its text already
  // in it is often not read out (VoiceOver in particular), so "Kopieret" and errors would be silent.
  const msg = Object.assign(document.createElement('span'), { className: 't-msg' });
  el.append(msg);
  if (opts.action) {
    const a = opts.action;
    const btn = 'href' in a ? Object.assign(document.createElement('a'), { href: a.href }) : document.createElement('button');
    btn.className = 't-act';
    btn.textContent = a.label;
    if (!('href' in a)) {
      (btn as HTMLButtonElement).type = 'button';
      btn.addEventListener('click', () => { a.run(); hideToast(false); });
    }
    el.append(btn);
  }
  const close = closeButton(t('admin.close'), 'small');
  close.removeAttribute('data-tip');
  close.addEventListener('click', () => hideToast());
  el.append(close);
  host.append(el);
  // Above an open dialog too (a modal dialog is in the top layer)
  ([...document.querySelectorAll('dialog[open]')].pop() ?? document.body).append(host);
  requestAnimationFrame(() => el.classList.add('shown'));
  window.setTimeout(() => { msg.textContent = text; }, 60);
  const me = { host, el, timer: 0, done: opts.onTimeout, error };
  current = me;
  if (error) return;
  let left = opts.duration ?? (opts.action ? 8000 : 4000);
  let started = Date.now();
  const arm = () => { started = Date.now(); me.timer = window.setTimeout(() => hideToast(), left); };
  arm();
  let held = 0;
  const pause = () => { if (current === me && held++ === 0) { clearTimeout(me.timer); left -= Date.now() - started; } };
  const resume = () => { if (current === me && --held === 0) arm(); };
  el.addEventListener('pointerenter', pause);
  el.addEventListener('pointerleave', resume);
  el.addEventListener('focusin', pause);
  el.addEventListener('focusout', resume);
}

/** Hides the toast; runs its onTimeout unless its action replaced it. */
export function hideToast(finish = true) {
  if (!current) return;
  const { host, el, timer, done } = current;
  current = null;
  clearTimeout(timer);
  if (finish) done?.();
  el.classList.remove('shown');
  setTimeout(() => host.remove(), 250);
}

/** Hides the toast only if it is an error (which stays until closed): call it when a new try worked (WIN-314). */
export function hideErrorToast() {
  if (current?.error) hideToast();
}
