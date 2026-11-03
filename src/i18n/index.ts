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
// Fall back to English formats in browsers without data for the locale (e.g. Icelandic)
export const locale = () => {
  const wanted = LANGS.find((l) => l.code === current)!.locale;
  return Intl.DateTimeFormat.supportedLocalesOf(wanted).length ? wanted : 'en-GB';
};

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
  return new Intl.DateTimeFormat(locale(), {
    ...(o.weekday ? { weekday: 'long' } : {}), day: 'numeric', month: o.month ?? 'long',
    ...(withYear(d, o.year) ? { year: 'numeric' } : {}),
    ...(o.time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: TZ,
  }).format(d);
}
/** "09.40" – the time of day */
export const formatTime = (iso: string | Date) =>
  new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));

export function formatWhen(iso: string, opts: { year?: boolean; end?: string | null } = {}) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale(), {
    weekday: 'long', day: 'numeric', month: 'long', ...(withYear(d, opts.year) ? { year: 'numeric' } : {}),
    timeZone: TZ,
  }).format(d);
  const hm = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  // With an end: "19:00–23:00"
  const time = hm.format(d) + (opts.end ? `–${hm.format(new Date(opts.end))}` : '');
  return t('when.at', { day: day[0].toUpperCase() + day.slice(1), time });
}
