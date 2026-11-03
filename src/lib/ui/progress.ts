// Component 38 – progress: one bar (a line with what it is and how far, then the bar) and one steps list – the
// "Get started" checklist (vertical, .steps) and the sign-in and sign-up steps (horizontal, .hsteps).
// Tones: ok (green – done is good), amber (where you are, the quiz), warn (a quota filling up), err (nearly full).
// Static markup: src/components/ui/Progress.astro and src/components/ui/Steps.astro.
import { iconSvg } from './icons';
import { mk } from './dom';

export type ProgressTone = 'ok' | 'amber' | 'warn' | 'err';

export interface ProgressOptions {
  label: string;
  value: number;
  max: number;
  /** The text at the right (default "4 of 12" is up to the caller; empty: none) */
  text?: string;
  tone?: ProgressTone;
  /** A quota (role="meter") rather than a task (role="progressbar") */
  meter?: boolean;
}

/** A new bar with its head line */
export function progress(o: ProgressOptions): HTMLDivElement {
  const box = mk('div', 'prog');
  box.append(mk('div', 'prog-h'), mk('div', 'bar'));
  box.querySelector('.bar')!.append(mk('i'));
  setProgress(box, o);
  return box;
}

/** Updates a bar (from progress() or Progress.astro) */
export function setProgress(box: HTMLElement, o: Partial<ProgressOptions> & { value: number; max: number }) {
  const head = box.querySelector<HTMLElement>('.prog-h');
  if (head && o.label != null) {
    head.replaceChildren(mk('b', '', o.label));
    if (o.text) head.append(mk('span', '', o.text));
  } else if (head && o.text != null) {
    let s = head.querySelector('span');
    if (!s) { s = mk('span'); head.append(s); }
    s.textContent = o.text;
  }
  const bar = box.querySelector<HTMLElement>('.bar')!;
  if (o.tone !== undefined) bar.className = 'bar' + (o.tone && o.tone !== 'ok' ? ' ' + o.tone : '');
  const share = o.max ? Math.max(0, Math.min(1, o.value / o.max)) : 0;
  (bar.firstElementChild as HTMLElement).style.width = `${share * 100}%`;
  bar.setAttribute('role', o.meter ? 'meter' : 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(o.max));
  bar.setAttribute('aria-valuenow', String(o.value));
  if (o.label) bar.setAttribute('aria-label', o.label);
  if (o.text) bar.setAttribute('aria-valuetext', o.text);
}

/** A step in a steps list: done (✓), now (filled, its number) or to come (its number) */
export function setStep(li: HTMLElement, n: number, state: 'done' | 'now' | 'todo') {
  li.classList.toggle('done', state === 'done');
  li.classList.toggle('now', state === 'now');
  if (state === 'now') li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  const ic = li.querySelector<HTMLElement>('.s-ic');
  if (ic) { if (state === 'done') ic.innerHTML = iconSvg('check'); else ic.textContent = String(n); }
}

/** A horizontal steps list (Steps.astro): the steps before i are done, i is now */
export function setSteps(list: HTMLElement, current: number) {
  [...list.querySelectorAll<HTMLElement>(':scope > li')].forEach((li, i) => setStep(li, i + 1, i < current ? 'done' : i === current ? 'now' : 'todo'));
}
