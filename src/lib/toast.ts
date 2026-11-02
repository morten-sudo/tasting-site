// A short message at the bottom of the screen after something is done ("Saved", "Deleted – Undo").
// One at a time; it stays while the pointer or focus is on it.
type Action = { label: string; run: () => void } | { label: string; href: string };

let current: { el: HTMLElement; timer: number } | null = null;

export function toast(text: string, opts: { action?: Action; ms?: number; kind?: 'ok' | 'error'; onTimeout?: () => void } = {}) {
  hideToast();
  const el = document.createElement('div');
  el.className = 'toast' + (opts.kind === 'error' ? ' error' : '');
  el.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = text;
  el.append(span);
  if (opts.action) {
    const a = opts.action;
    const btn = 'href' in a ? Object.assign(document.createElement('a'), { href: a.href }) : document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = a.label;
    if (!('href' in a)) {
      (btn as HTMLButtonElement).type = 'button';
      btn.addEventListener('click', () => { a.run(); hideToast(false); });
    }
    el.append(btn);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', '×');
  close.textContent = '×';
  close.addEventListener('click', () => hideToast());
  el.append(close);
  // Above an open dialog too
  (document.querySelector('dialog[open]') ?? document.body).append(el);
  requestAnimationFrame(() => el.classList.add('shown'));
  const ms = opts.ms ?? 5000;
  let left = ms, started = Date.now();
  const arm = () => window.setTimeout(() => { hideToast(); }, left);
  current = { el, timer: arm() };
  const me = current;
  (el as HTMLElement & { _timeout?: () => void })._timeout = opts.onTimeout;
  const pause = () => { if (current === me) { clearTimeout(me.timer); left -= Date.now() - started; } };
  const resume = () => { if (current === me) { started = Date.now(); me.timer = arm(); } };
  el.addEventListener('pointerenter', pause);
  el.addEventListener('pointerleave', resume);
  el.addEventListener('focusin', pause);
  el.addEventListener('focusout', resume);
}

/** Hides the toast; runs its onTimeout unless an action replaced it. */
export function hideToast(finish = true) {
  if (!current) return;
  const { el, timer } = current;
  current = null;
  clearTimeout(timer);
  if (finish) (el as HTMLElement & { _timeout?: () => void })._timeout?.();
  el.classList.remove('shown');
  setTimeout(() => el.remove(), 250);
}
