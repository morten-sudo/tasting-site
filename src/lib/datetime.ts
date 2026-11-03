// Date, start and end of a tasting: our own calendar (in the page's language, Monday first, no past days for a
// new tasting) and time fields written as 19:00 – instead of the browser's pickers, which follow the browser's
// own format (mm/dd/yyyy, AM/PM). Ids: <prefix>-date (hidden, yyyy-mm-dd), <prefix>-date-show (the button),
// <prefix>-cal (the calendar), <prefix>-time and <prefix>-end (hh:mm).
import { iconButton } from './ui/icon-button';
import { t, locale } from '../i18n';
import { fieldError } from './field-error';

const el = <E extends HTMLElement = HTMLInputElement>(prefix: string, name: string) => document.getElementById(`${prefix}-${name}`) as E;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

/** "19", "1930", "19.30", "19:30", "7:30" → "19:30" / "07:30"; '' for empty; null when it is not a time. */
export function normTime(v: string): string | null {
  const s = v.trim().replace(/[.,h ]/g, ':').replace(/:+/g, ':');
  if (!s) return '';
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

/** The date shown on the button: "Thursday 3 December 2026" in the page's language. */
function showDate(prefix: string) {
  const v = el(prefix, 'date').value;
  const b = el<HTMLButtonElement>(prefix, 'date-show');
  const text = b.querySelector('span') ?? b;
  if (!v) { text.textContent = t('dt.choose'); b.classList.add('empty'); return; }
  const s = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fromYmd(v));
  text.textContent = s[0].toUpperCase() + s.slice(1);
  b.classList.remove('empty');
}

export function initWhen(prefix: string) {
  const hidden = el(prefix, 'date');
  const btn = el<HTMLButtonElement>(prefix, 'date-show');
  const cal = el<HTMLDivElement>(prefix, 'cal');
  let month = new Date(); // the month shown
  let focusDay: Date | null = null;

  function setDate(d: Date | null) {
    hidden.value = d ? ymd(d) : '';
    showDate(prefix);
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    fieldError(btn, null);
  }

  function render() {
    const min = hidden.min ? fromYmd(hidden.min) : null;
    const chosen = hidden.value ? fromYmd(hidden.value) : null;
    const today = ymd(new Date());
    const y = month.getFullYear(), m = month.getMonth();
    const head = document.createElement('div');
    head.className = 'dt-cal-head';
    const prev = iconButton('left', t('dt.prevMonth'), { tip: false });
    const next = iconButton('right', t('dt.nextMonth'), { tip: false });
    const title = document.createElement('b');
    const mt = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(y, m, 1));
    title.textContent = mt[0].toUpperCase() + mt.slice(1);
    title.setAttribute('aria-live', 'polite');
    prev.disabled = !!min && new Date(y, m, 1) <= new Date(min.getFullYear(), min.getMonth(), 1);
    prev.addEventListener('click', () => { month = new Date(y, m - 1, 1); render(); });
    next.addEventListener('click', () => { month = new Date(y, m + 1, 1); render(); });
    head.append(prev, title, next);

    const grid = document.createElement('div');
    grid.className = 'dt-grid';
    grid.setAttribute('role', 'grid');
    // Weekday names, Monday first
    const wd = new Intl.DateTimeFormat(locale(), { weekday: 'short' });
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span');
      s.className = 'dt-wd';
      s.textContent = wd.format(new Date(2024, 0, 1 + i)).replace('.', ''); // 1 Jan 2024 was a Monday
      grid.append(s);
    }
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) grid.append(document.createElement('span'));
    const days = new Date(y, m + 1, 0).getDate();
    const fd = focusDay && focusDay.getMonth() === m && focusDay.getFullYear() === y ? focusDay.getDate()
      : chosen && chosen.getMonth() === m && chosen.getFullYear() === y ? chosen.getDate() : null;
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dt-day';
      b.textContent = String(d);
      b.dataset.day = ymd(date);
      b.setAttribute('aria-label', new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(date));
      if (ymd(date) === today) b.classList.add('today');
      if (chosen && ymd(date) === ymd(chosen)) { b.classList.add('chosen'); b.setAttribute('aria-pressed', 'true'); }
      if (min && date < min) b.disabled = true;
      if ([0, 6].includes(date.getDay())) b.classList.add('weekend');
      b.tabIndex = d === (fd ?? (min && min.getMonth() === m && min.getFullYear() === y ? min.getDate() : 1)) ? 0 : -1;
      b.addEventListener('click', () => { setDate(date); close(); });
      grid.append(b);
    }
    cal.replaceChildren(head, grid);
  }

  function open() {
    month = hidden.value ? fromYmd(hidden.value) : hidden.min ? fromYmd(hidden.min) : new Date();
    month = new Date(month.getFullYear(), month.getMonth(), 1);
    focusDay = null;
    render();
    cal.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    cal.querySelector<HTMLButtonElement>('.dt-day[tabindex="0"]')?.focus();
  }
  function close(refocus = true) {
    if (cal.hidden) return;
    cal.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  }
  btn.addEventListener('click', () => (cal.hidden ? open() : close()));
  // Keyboard in the calendar: arrows by day/week, Page Up/Down by month, Esc closes
  cal.addEventListener('keydown', (e) => {
    const cur = (document.activeElement as HTMLElement | null)?.dataset.day;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (!cur) return;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let d = fromYmd(cur);
    if (e.key in step) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step[e.key]);
    else if (e.key === 'PageUp') d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate());
    else if (e.key === 'PageDown') d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
    else return;
    e.preventDefault();
    focusDay = d;
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) { month = new Date(d.getFullYear(), d.getMonth(), 1); render(); }
    const b = cal.querySelector<HTMLButtonElement>(`[data-day="${ymd(d)}"]`);
    if (b) { cal.querySelectorAll<HTMLButtonElement>('.dt-day').forEach((x) => (x.tabIndex = -1)); b.tabIndex = 0; b.focus(); }
  });
  // A click elsewhere closes it
  document.addEventListener('pointerdown', (e) => {
    if (!cal.hidden && !cal.contains(e.target as Node) && !btn.contains(e.target as Node)) close(false);
  });

  // Picking a date with no time suggests 19:00, which the host can change
  hidden.addEventListener('change', () => { if (hidden.value && !el(prefix, 'time').value) el(prefix, 'time').value = '19:00'; });
  // Times: written as 19:00 when the field is left; quick picks under the start time
  for (const name of ['time', 'end']) {
    const input = el(prefix, name);
    input.addEventListener('blur', () => {
      const n = normTime(input.value);
      if (n == null) fieldError(input, t('dt.badTime'));
      else input.value = n;
    });
  }
  document.querySelectorAll<HTMLButtonElement>(`#${prefix}-quick button`).forEach((b) => b.addEventListener('click', () => {
    el(prefix, 'time').value = b.dataset.time!;
    fieldError(el(prefix, 'time'), null);
  }));
  showDate(prefix);
}

export function writeWhen(prefix: string, iso: unknown, endIso?: unknown) {
  const d = typeof iso === 'string' && iso ? new Date(iso) : null;
  el(prefix, 'date').value = d ? ymd(d) : '';
  el(prefix, 'time').value = d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
  const e = typeof endIso === 'string' && endIso ? new Date(endIso) : null;
  el(prefix, 'end').value = e ? `${pad(e.getHours())}:${pad(e.getMinutes())}` : '';
  showDate(prefix);
}

/** ISO timestamp, or null without a date. A date without a time counts as 19:00. */
export function readWhen(prefix: string): string | null {
  const date = el(prefix, 'date').value;
  if (!date) return null;
  const time = normTime(el(prefix, 'time').value) || '19:00';
  return new Date(`${date}T${time}`).toISOString();
}

/** The end as ISO, or null; an end earlier than the start is the next day (a tasting until 01:00). */
export function readEnd(prefix: string): string | null {
  const start = readWhen(prefix);
  const end = normTime(el(prefix, 'end').value);
  if (!start || !end) return null;
  const date = el(prefix, 'date').value;
  let e = new Date(`${date}T${end}`);
  if (e.getTime() <= new Date(start).getTime()) e = new Date(e.getTime() + 24 * 3600 * 1000);
  return e.toISOString();
}

/**
 * Checks the fields and shows what is wrong under them; true when fine.
 * `future`: a new tasting is held from now on.
 */
export function checkWhen(prefix: string, future: boolean): boolean {
  let ok = true;
  for (const name of ['time', 'end']) {
    const input = el(prefix, name);
    if (normTime(input.value) == null) { fieldError(input, t('dt.badTime')); ok = false; }
  }
  if (!ok) return false;
  if (!el(prefix, 'date').value && (el(prefix, 'time').value || el(prefix, 'end').value)) {
    fieldError(el(prefix, 'date-show'), t('dt.dateFirst'));
    return false;
  }
  if (future && isPast(prefix)) {
    fieldError(el(prefix, el(prefix, 'date').value < ymd(new Date()) ? 'date-show' : 'time'), t('admin.dateInPast'));
    return false;
  }
  return true;
}

/** A new tasting cannot be in the past: the calendar starts today (an existing one keeps any date). */
export function futureOnly(prefix: string, on: boolean) {
  el(prefix, 'date').min = on ? ymd(new Date()) : '';
}

/** True when the date and time typed are before now (a time earlier today counts as past). */
export function isPast(prefix: string): boolean {
  const iso = readWhen(prefix);
  return !!iso && new Date(iso).getTime() < Date.now();
}
