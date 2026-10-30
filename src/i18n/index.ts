// Translations for the site. English is the source language; Danish and Icelandic
// dictionaries use the same keys. Markup carries English text plus data-i18n keys,
// which applyI18n() swaps for the active language.
//   data-i18n="key"            → textContent
//   data-i18n-html="key"       → innerHTML (dictionary values are our own trusted HTML)
//   data-i18n-attr="placeholder=key;aria-label=key"
import { en } from './en';
import { da } from './da';
import { is } from './is';

export type Lang = 'da' | 'en' | 'is';
export type Key = keyof typeof en;

export const LANGS: { code: Lang; name: string; locale: string }[] = [
  { code: 'da', name: 'Dansk', locale: 'da-DK' },
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'is', name: 'Íslenska', locale: 'is-IS' },
];

const DICTS: Record<Lang, Partial<Record<Key, string>>> = { en, da, is };
const LANG_KEY = 'lang';

const isLang = (v: unknown): v is Lang => v === 'da' || v === 'en' || v === 'is';

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
    if (code === 'is') return 'is';
    if (code === 'en') return 'en';
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
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const text = DICTS[current][key] ?? en[key] ?? key;
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

/**
 * Settles the language before pages render:
 * the user's own choice → the tasting's language (on tasting pages) → the browser's language.
 */
async function resolveLang(): Promise<Lang> {
  const chosen = chosenLang();
  if (chosen) return chosen;
  // Guest pages follow the tasting's language; the host's admin does not
  const m = location.pathname.match(/^\/t\/([a-z0-9-]+)(\/|$)/);
  if (m && !location.pathname.includes('/admin/')) {
    try {
      const { supabase } = await import('../lib/supabase');
      const { data } = await supabase.rpc('get_tasting', { slug: m[1] });
      const tl = (data as { language?: string } | null)?.language;
      if (isLang(tl)) return tl;
    } catch {}
  }
  return browserLang();
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
export const money = (amount: number) =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency: 'DKK' }).format(amount);

export function formatWhen(iso: string, opts: { year?: boolean } = {}) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale(), {
    weekday: 'long', day: 'numeric', month: 'long', ...(opts.year ? { year: 'numeric' } : {}),
    timeZone: 'Europe/Copenhagen',
  }).format(d);
  const time = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' }).format(d);
  return t('when.at', { day: day[0].toUpperCase() + day.slice(1), time });
}
