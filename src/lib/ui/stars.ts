// Component 16 – stars: rating a wine (five buttons, a radio group) and showing a rating (read-only, drawn as SVG –
// never ★☆ text). starsRo() is the small line in cards, rows and the wine book; starsInput() the guest's own rating.
import { t } from '../../i18n';

const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';
const svg = (cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}><path d="${STAR}"/></svg>`;

/** Read-only: five stars filled to the value (rounded to the nearest whole star), then an optional text ("4,2 (8)").
 *  `chip`: drawn as a chip in a row of chips. */
export function starsRo(value: number, text = '', opts: { chip?: boolean } = {}): HTMLElement {
  const el = document.createElement('span');
  el.className = 'stars-ro' + (opts.chip ? ' chip' : '');
  let h = '<span class="s" aria-hidden="true">';
  for (let k = 1; k <= 5; k++) h += svg(value >= k - 0.25 ? 'full' : 'off');
  el.innerHTML = h + '</span>';
  const avg = value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (text) el.append(document.createTextNode(text));
  // Screen readers hear the value once, not five pictures
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', [t('stars.ro', { avg }), text && text.trim() !== avg ? text.trim() : ''].filter(Boolean).join(' · '));
  return el;
}

export interface StarsInput { el: HTMLElement; value: () => number | null; set: (n: number | null) => void; setBusy: (on: boolean) => void; setDisabled: (on: boolean) => void }

/** The guest's own rating: tap a star; tap the chosen star again to clear. Arrow keys move the choice. */
export function starsInput(opts: { value?: number | null; label?: string; disabled?: boolean; onRate: (n: number | null) => void }): StarsInput {
  let value = opts.value ?? null;
  const row = document.createElement('div');
  row.className = 'stars' + (opts.disabled ? ' dis' : '');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', opts.label ?? t('rating.title'));
  const buttons: HTMLButtonElement[] = [];
  for (let k = 1; k <= 5; k++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', t(k === 1 ? 'rating.starOne' : 'rating.starMany', { n: k }));
    b.innerHTML = svg();
    b.disabled = !!opts.disabled;
    b.addEventListener('click', () => choose(value === k ? null : k));
    // Hovering shows what a tap would give
    b.addEventListener('mouseenter', () => { if (!b.disabled) { row.classList.add('preview'); paint(k); } });
    buttons.push(b);
    row.append(b);
  }
  row.addEventListener('mouseleave', () => { row.classList.remove('preview'); paint(); });
  row.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = Math.min(5, Math.max(1, (value ?? 0) + d));
    choose(n);
    buttons[n - 1].focus();
  });
  function choose(n: number | null) {
    value = n;
    row.classList.remove('preview');
    paint();
    opts.onRate(n);
  }
  function paint(pre = 0) {
    buttons.forEach((b, i) => {
      b.classList.toggle('on', value !== null && i < value);
      b.classList.toggle('pre', i < pre);
      b.setAttribute('aria-checked', String(value === i + 1));
      // One tab stop: the chosen star (or the first)
      b.tabIndex = (value ?? 1) === i + 1 ? 0 : -1;
    });
  }
  paint();
  return {
    el: row,
    value: () => value,
    set: (n) => { value = n; paint(); },
    setBusy: (on) => row.classList.toggle('busy', on),
    setDisabled: (on) => { row.classList.toggle('dis', on); buttons.forEach((b) => (b.disabled = on)); },
  };
}
