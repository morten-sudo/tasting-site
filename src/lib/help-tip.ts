// Small "?" buttons in admin: a bubble with a short explanation and a link to the right part of the help.
// Mark an element with data-help="<tip>" (a key in TIPS); the button is put at the end of it.
import { TIPS, pick } from './help-content';
import { t } from '../i18n';

let bubble: HTMLDivElement | null = null;
let openFor: HTMLButtonElement | null = null;

function close() {
  bubble?.remove();
  bubble = null;
  openFor?.setAttribute('aria-expanded', 'false');
  openFor = null;
}

function open(btn: HTMLButtonElement, key: string) {
  const tip = TIPS[key];
  if (!tip) return;
  close();
  const box = document.createElement('div');
  box.className = 'help-bubble';
  box.id = 'help-bubble';
  box.setAttribute('role', 'dialog');
  const text = document.createElement('p');
  text.innerHTML = pick(tip.text);
  const more = document.createElement('a');
  more.href = `/admin/help/#${tip.more}`;
  more.textContent = t('help.more');
  box.append(text, more);
  document.body.append(box);
  // Under the button, kept inside the screen
  const r = btn.getBoundingClientRect();
  const w = box.offsetWidth;
  const left = Math.max(8, Math.min(window.scrollX + r.left + r.width / 2 - w / 2, window.scrollX + document.documentElement.clientWidth - w - 8));
  box.style.left = `${left}px`;
  box.style.top = `${window.scrollY + r.bottom + 8}px`;
  bubble = box;
  openFor = btn;
  btn.setAttribute('aria-expanded', 'true');
}

/** Puts a "?" button in every [data-help] element inside root (once) */
export function initHelpTips(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-help]').forEach((el) => {
    if (el.querySelector(':scope > .help-q')) return;
    const key = el.dataset.help!;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'help-q';
    btn.textContent = '?';
    btn.setAttribute('aria-label', t('help.what'));
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'help-bubble');
    btn.addEventListener('click', (e) => {
      // Inside a label: do not tick the checkbox
      e.preventDefault();
      e.stopPropagation();
      if (openFor === btn) close(); else open(btn, key);
    });
    el.append(btn);
  });
}

document.addEventListener('click', (e) => {
  if (bubble && !bubble.contains(e.target as Node)) close();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
window.addEventListener('resize', close);

/** Links from the help: ?open=<id> presses that button (e.g. "Invite guest"), #<id> scrolls to that spot and
 *  marks it for a moment. Called by a page once its content is shown. */
export function followHelpLink() {
  const params = new URLSearchParams(location.search);
  const open = params.get('open');
  const id = decodeURIComponent(location.hash.slice(1));
  requestAnimationFrame(() => {
    if (open) {
      document.getElementById(open)?.click();
      params.delete('open');
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    }
    const target = id ? document.getElementById(id) : null;
    if (target && !target.closest('[hidden]')) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('help-flash');
      setTimeout(() => target.classList.remove('help-flash'), 2400);
    }
  });
}
