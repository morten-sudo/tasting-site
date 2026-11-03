// Component 17 – stepper: a whole number with − and + (the cart, the host's number of bottles). − and + stop at
// min and max; ↑/↓ on a button change it too. setBusy(true) shows the spinner while the new number is saved.
import { t } from '../../i18n';
import { iconSvg } from './icons';

export interface Stepper { el: HTMLElement; value: number; set: (n: number) => void; setBusy: (on: boolean) => void; setMax: (n: number) => void; focus: () => void }

export function stepper(opts: { value: number; min?: number; max?: number; small?: boolean; label?: string; lessLabel?: string; moreLabel?: string; onChange?: (n: number) => void }): Stepper {
  let value = opts.value;
  const min = opts.min ?? 0;
  let max = opts.max ?? 999;
  const el = document.createElement('div');
  el.className = 'stepper' + (opts.small ? ' small' : '');
  el.setAttribute('role', 'group');
  if (opts.label) el.setAttribute('aria-label', opts.label);
  const mkBtn = (icon: 'minus' | 'plus', label: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.innerHTML = iconSvg(icon);
    return b;
  };
  const less = mkBtn('minus', opts.lessLabel ?? t('stepper.less'));
  const more = mkBtn('plus', opts.moreLabel ?? t('stepper.more'));
  const out = document.createElement('output');
  out.setAttribute('aria-live', 'polite');
  el.append(less, out, more);

  function paint() {
    out.textContent = String(value);
    less.disabled = value <= min;
    more.disabled = value >= max;
  }
  function change(n: number) {
    const next = Math.min(max, Math.max(min, n));
    if (next === value) return;
    value = next;
    paint();
    opts.onChange?.(value);
  }
  less.addEventListener('click', () => change(value - 1));
  more.addEventListener('click', () => change(value + 1));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); change(value + 1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); change(value - 1); }
  });
  paint();
  const api: Stepper = {
    el,
    get value() { return value; },
    set value(n: number) { value = n; paint(); },
    set: (n) => { value = n; paint(); },
    setMax: (n) => { max = n; paint(); },
    focus: () => (more.disabled ? less : more).focus(),
    setBusy(on) {
      el.classList.toggle('busy', on);
      el.setAttribute('aria-busy', String(on));
      if (on) { less.disabled = true; more.disabled = true; out.insertAdjacentHTML('beforeend', '<span class="spin" aria-hidden="true"></span>'); }
      else { out.querySelector('.spin')?.remove(); paint(); }
    },
  };
  return api;
}
