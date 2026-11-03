// Component 1 – button: .btn (primary), .btn.secondary, .btn.danger (only in the question), .btn.quiet-danger
// (last in a panel), .btn.small. While it works: setLoading(btn, true, 'Saving …') – the glass spinner in front of
// the label, the button disabled; setLoading(btn, false) puts the label back.
import { setIconLoading } from './icon-button';

const saved = new WeakMap<HTMLElement, string>();

export function setLoading(btn: HTMLButtonElement | HTMLElement, on: boolean, label?: string) {
  const b = btn as HTMLButtonElement;
  if (b.classList.contains('icon-act')) { setIconLoading(b, on); return; }
  if (on) {
    if (!b.classList.contains('loading')) saved.set(b, b.innerHTML);
    b.classList.add('loading');
    b.setAttribute('aria-busy', 'true');
    b.disabled = true;
    const white = !b.matches('.secondary, .quiet-danger, .text-btn, .on-photo');
    const text = label ?? b.textContent?.trim() ?? '';
    b.innerHTML = `<span class="spin${white ? ' white' : ''}" aria-hidden="true"></span>`;
    b.append(document.createTextNode(text));
  } else {
    b.classList.remove('loading');
    b.removeAttribute('aria-busy');
    b.disabled = false;
    const html = saved.get(b);
    if (html != null) { b.innerHTML = html; saved.delete(b); }
  }
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet-danger';

export function button(label: string, opts: { variant?: ButtonVariant; small?: boolean; type?: 'button' | 'submit' } = {}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = opts.type ?? 'button';
  b.className = 'btn' + (opts.variant && opts.variant !== 'primary' ? ' ' + opts.variant : '') + (opts.small ? ' small' : '');
  b.textContent = label;
  return b;
}
