// Translations for the site. English is the source language; the Danish, Icelandic,
// French, German, Italian, Spanish, Dutch and Polish dictionaries use the same keys. Markup carries English text plus data-i18n keys,
// which applyI18n() swaps for the active language.
//   data-i18n="key"            → textContent
//   data-i18n-html="key"       → innerHTML (dictionary values are our own trusted HTML)
//   data-i18n-attr="placeholder=key;aria-label=key"
import { en } from './en';
import { da } from './da';
import { is } from './is';
import { fr } from './fr';
import { de } from './de';
import { it } from './it';
import { es } from './es';
import { nl } from './nl';
import { pl } from './pl';

export type Lang = 'da' | 'en' | 'is' | 'fr' | 'de' | 'it' | 'es' | 'nl' | 'pl';
export type Key = keyof typeof en;

export const LANGS: { code: Lang; name: string; locale: string }[] = [
  { code: 'da', name: 'Dansk', locale: 'da-DK' },
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'is', name: 'Íslenska', locale: 'is-IS' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'it', name: 'Italiano', locale: 'it-IT' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'nl', name: 'Nederlands', locale: 'nl-NL' },
  { code: 'pl', name: 'Polski', locale: 'pl-PL' },
];

const DICTS: Record<Lang, Partial<Record<Key, string>>> = { en, da, is, fr, de, it, es, nl, pl };
const LANG_KEY = 'lang';

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && Object.hasOwn(DICTS, v);

let current: Lang = 'en';

/** The language the user picked explicitly on this device, if any. */
export function chosenLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function browserLang(): Lang {
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.toLowerCase().slice(0, 2);
    if (code === 'da' || code === 'nb' || code === 'no' || code === 'sv') return 'da';
    if (isLang(code)) return code;
  }
  return 'en';
}

export const lang = () => current;
// Fall back to English formats in browsers without data for the locale (e.g. Icelandic) – dates do not: they use the
// site's own month and day names then (ownDate below, WIN-322)
export const locale = () => {
  const wanted = LANGS.find((l) => l.code === current)!.locale;
  return Intl.DateTimeFormat.supportedLocalesOf(wanted).length ? wanted : 'en-GB';
};
/** Whether the browser has date (and relative-time) data for the page's language */
export const hasDateData = () => {
  const wanted = LANGS.find((l) => l.code === current)!.locale;
  return Intl.DateTimeFormat.supportedLocalesOf(wanted).length > 0;
};
export const hasRelativeData = () => {
  const wanted = LANGS.find((l) => l.code === current)!.locale;
  return typeof Intl.RelativeTimeFormat === 'function' && Intl.RelativeTimeFormat.supportedLocalesOf(wanted).length > 0;
};

export interface DateOpts { weekday?: 'long' | 'short'; day?: boolean; month?: 'long' | 'short'; year?: boolean; time?: boolean; timeZone?: string }
const EN_WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const names = (key: Key) => t(key).split(',').map((x) => x.trim());
/** A date in the page's language from the site's own month and day names (date.months …) – for browsers without
 *  date data for the language. "fimmtudagur 3. desember 2026, 19:00" / "Thursday 3 December 2026, 19:00". */
export function ownDate(when: Date, o: DateOpts): string {
  // The numbers in the right time zone (English data is always there)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    ...(o.timeZone ? { timeZone: o.timeZone } : {}),
  }).formatToParts(when).map((x) => [x.type, x.value]));
  const wd = EN_WD.indexOf(p.weekday);
  const mon = Number(p.month) - 1;
  const dot = current === 'da' || current === 'is' || current === 'de';
  const out: string[] = [];
  let date = '';
  if (o.day !== false && o.month) {
    const m = names(o.month === 'short' ? 'date.monthsShort' : 'date.months')[mon] ?? '';
    date = current === 'es' ? `${p.day} de ${m}` : `${p.day}${dot ? '.' : ''} ${m}`;
  } else if (o.month) date = names('date.months')[mon] ?? '';
  if (o.year) date += current === 'es' ? ` de ${p.year}` : ` ${p.year}`;
  if (o.weekday) {
    const w = names(o.weekday === 'short' ? 'date.weekdaysShort' : 'date.weekdays')[wd] ?? '';
    out.push(date ? w + (current === 'de' || current === 'es' || current === 'pl' ? ',' : '') : w);
  }
  if (date) out.push(date);
  let text = out.join(' ');
  if (o.time) text += (text ? ', ' : '') + `${p.hour}:${p.minute}`;
  return text;
}
/** The one way to write a date: the browser's data for the language, else the site's own names */
export function dateText(when: Date, o: DateOpts): string {
  if (!hasDateData()) return ownDate(when, o);
  return new Intl.DateTimeFormat(locale(), {
    ...(o.weekday ? { weekday: o.weekday } : {}), ...(o.day !== false && o.month ? { day: 'numeric' } : {}),
    ...(o.month ? { month: o.month } : {}), ...(o.year ? { year: 'numeric' } : {}),
    ...(o.time ? { hour: '2-digit', minute: '2-digit' } : {}), ...(o.timeZone ? { timeZone: o.timeZone } : {}),
  }).format(when);
}

/** Translate a key; {name} placeholders are filled from vars. */
// Which plural form a number takes in the page's language ("one", "few", "other" …)
let rules: { lang: string; r: Intl.PluralRules } | null = null;
function pluralOf(n: number): string {
  if (rules?.lang !== current) rules = { lang: current, r: new Intl.PluralRules(locale()) };
  return rules.r.select(n);
}

/**
 * The text for a key in the page's language. With a number {n}, a form for that number is used when there is
 * one: "<key>#one" for 1 in most languages ("1 wine", "1 vin"), from the same language as the rest.
 */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const dict = DICTS[current] as Record<string, string | undefined>;
  const n = typeof vars.n === 'number' ? vars.n : typeof vars.n === 'string' && /^\d+$/.test(vars.n) ? Number(vars.n) : null;
  const form = n != null ? pluralOf(n) : 'other';
  const own = form !== 'other' ? dict[`${key}#${form}`] : undefined;
  const fromEn = form !== 'other' && !dict[key] ? (en as Record<string, string | undefined>)[`${key}#${form}`] : undefined;
  const text = own ?? fromEn ?? DICTS[current][key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Pick a plural form: t(n === 1 ? one : other) */
export const plural = (n: number, one: Key, other: Key, vars: Record<string, string | number> = {}) =>
  t(n === 1 ? one : other, { n, ...vars });

export function applyI18n(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as Key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml as Key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr!.split(';')) {
      const [attr, key] = pair.split('=').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key as Key));
    }
  });
  document.documentElement.lang = current;
}

/** Settles the language before pages render: the user's own choice → the browser's language. */
async function resolveLang(): Promise<Lang> {
  return chosenLang() ?? browserLang();
}

export const i18nReady: Promise<Lang> = resolveLang().then((l) => {
  current = l;
  applyI18n();
  document.documentElement.classList.remove('i18n-pending');
  return l;
});

/** Switch language, remember it, and reload so every page part re-renders. */
export async function setLang(l: Lang) {
  try { localStorage.setItem(LANG_KEY, l); } catch {}
  try {
    // Remember it on the account too, so sign-in emails come in this language
    const { supabase } = await import('../lib/supabase');
    const { data } = await supabase.auth.getSession();
    if (data.session) await supabase.auth.updateUser({ data: { lang: l } });
  } catch {}
  location.reload();
}

// Shared formatters for the active language

// Every date on the site goes through formatWhen (a tasting's time) or formatDate (anything else), in Danish time.
// The year is shown when the date is not in this year – unless year says otherwise.
const TZ = 'Europe/Copenhagen';
const yearOf = (d: Date) => new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: TZ }).format(d);
const withYear = (d: Date, year?: boolean) => year ?? yearOf(d) !== yearOf(new Date());

/** "3. november", "3. nov. 2025", "3. nov., 09.40" – a date, short or long month, optionally with the time */
export function formatDate(iso: string | Date, o: { month?: 'long' | 'short'; time?: boolean; year?: boolean; weekday?: boolean } = {}) {
  const d = new Date(iso);
  return dateText(d, { weekday: o.weekday ? 'long' : undefined, month: o.month ?? 'long', year: withYear(d, o.year), time: o.time, timeZone: TZ });
}
/** "09.40" – the time of day */
export const formatTime = (iso: string | Date) => dateText(new Date(iso), { time: true, timeZone: TZ });

export function formatWhen(iso: string, opts: { year?: boolean; end?: string | null } = {}) {
  const d = new Date(iso);
  const day = dateText(d, { weekday: 'long', month: 'long', year: withYear(d, opts.year), timeZone: TZ });
  // With an end: "19:00–23:00"
  const time = formatTime(d) + (opts.end ? `–${formatTime(opts.end)}` : '');
  return t('when.at', { day: day[0].toUpperCase() + day.slice(1), time });
}
