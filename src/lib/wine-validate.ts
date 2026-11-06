// Checking the wine form: each field says what is wrong right under it (inline), when it is left and
// before "Next" or "Save". Amounts accept both "144,95" and "144.95" (and "1.234,50", "kr.").
import { t } from '../i18n';
import { liveText } from './field-error';
import { parseCl, validCl } from './bottle';

/** A price or other amount typed by a person, or NaN when it is not a number. Empty → null. */
export function parseAmount(v: string): number | null {
  let s = v.trim().replace(/\s|kr\.?|dkk/gi, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // The last of the two separates the decimals: "1.234,50" or "1,234.50"
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else s = s.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** An amount written the way the page's language writes it ("144,95" in Danish). */
export function amountText(n: number | null | undefined, locale: string): string {
  if (n == null) return '';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(n);
}

type Rule = (v: string, form: HTMLFormElement) => string | null; // the error's i18n key, or null when fine
const value = (form: HTMLFormElement, id: string) => (form.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '').trim();

export const WINE_RULES: Record<string, Rule> = {
  'wf-name': (v) => (v ? null : 'wineCheck.name'),
  'wf-vintage': (v) => {
    if (!v || /^n\.?\s?v\.?$/i.test(v)) return null;
    const year = /^\d{4}$/.test(v) ? Number(v) : null;
    if (year != null) return year >= 1800 && year <= new Date().getFullYear() + 1 ? null : 'wineCheck.vintageYear';
    // "10 years", "20 Year Old", "LBV 2018" – but there must be a number in it
    return /\d/.test(v) ? null : 'wineCheck.vintage';
  },
  'wf-abv': (v) => {
    const n = parseAmount(v);
    return n == null || (n > 0 && n <= 80) ? null : 'wineCheck.abv';
  },
  'wf-retail': (v) => {
    const n = parseAmount(v);
    return n == null || (n > 0 && n < 1_000_000) ? null : 'wineCheck.price';
  },
  'wf-offer-price': (v, form) => {
    const n = parseAmount(v);
    if (n == null) return value(form, 'wf-offer-qty') ? 'wineCheck.offerPriceMissing' : null;
    if (!(n > 0 && n < 1_000_000)) return 'wineCheck.price';
    const retail = parseAmount(value(form, 'wf-retail'));
    return retail != null && !Number.isNaN(retail) && n >= retail ? 'wineCheck.offerNotLower' : null;
  },
  // Another bottle size: only when "Another size" is chosen; 5–3000 cl as the database allows
  'wf-bottle-other': (v, form) => {
    if (!form.querySelector<HTMLInputElement>('input[name="wf-bottle"][value="other"]')?.checked) return null;
    return validCl(parseCl(v)) ? null : 'wineCheck.bottle';
  },
  'wf-offer-qty': (v, form) => {
    if (!v) return value(form, 'wf-offer-price') ? 'wineCheck.offerQtyMissing' : null;
    // 1 is allowed: a lower price on a single bottle
    return /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 99 ? null : 'wineCheck.offerQtyOne';
  },
};
// The offer's two fields share one line, so they share one message (under the line)
const SHARED: Record<string, string> = { 'wf-offer-price': 'wf-offer', 'wf-offer-qty': 'wf-offer' };

export function wineChecks(form: HTMLFormElement) {
  const input = (id: string) => form.querySelector<HTMLInputElement>(`#${id}`)!;
  /** The message element under a field (made on first use). */
  function messageFor(id: string): HTMLElement {
    const key = SHARED[id] ?? id;
    let m = form.querySelector<HTMLElement>(`#${key}-error`);
    if (!m) {
      m = document.createElement('p');
      m.id = `${key}-error`;
      m.className = 'field-error';
      m.setAttribute('aria-live', 'polite');
      m.hidden = true;
      // After the field, or after the row the field sits in
      const el = input(id);
      const after = el.closest('.field-row') ?? el.closest('.inline-form, .affix') ?? el;
      after.after(m);
    }
    return m;
  }
  /** Checks one field and shows or clears its message; true when fine. */
  function check(id: string): boolean {
    const rule = WINE_RULES[id];
    if (!rule) return true;
    const el = input(id);
    const err = rule(el.value.trim(), form);
    // The offer: show the first of the two fields' errors
    const ids = SHARED[id] ? Object.keys(SHARED).filter((k) => SHARED[k] === SHARED[id]) : [id];
    const errs = ids.map((k) => (k === id ? err : WINE_RULES[k](input(k).value.trim(), form)));
    ids.forEach((k, i) => {
      const bad = !!errs[i];
      input(k).toggleAttribute('aria-invalid', bad);
      if (bad) input(k).setAttribute('aria-describedby', messageFor(k).id); else input(k).removeAttribute('aria-describedby');
    });
    const first = errs.find(Boolean);
    const m = messageFor(id);
    liveText(m, first ? t(first as Parameters<typeof t>[0]) : null);
    return !err;
  }
  /** Checks all fields in a part of the form; focuses the first wrong one. */
  function checkWithin(root: ParentNode): boolean {
    let firstBad: HTMLInputElement | null = null;
    for (const id of Object.keys(WINE_RULES)) {
      const el = root.querySelector<HTMLInputElement>(`#${id}`);
      if (el && !check(id) && !firstBad) firstBad = el;
    }
    firstBad?.focus();
    return !firstBad;
  }
  function clear() {
    for (const id of Object.keys(WINE_RULES)) {
      input(id).removeAttribute('aria-invalid');
      input(id).removeAttribute('aria-describedby');
      const m = form.querySelector<HTMLElement>(`#${SHARED[id] ?? id}-error`);
      if (m) m.hidden = true;
    }
  }
  for (const id of Object.keys(WINE_RULES)) {
    const el = input(id);
    // When the field is left, and while typing once it has shown an error (so the error goes away when fixed)
    el.addEventListener('blur', () => { if (el.value.trim() || el.hasAttribute('aria-invalid')) check(id); });
    el.addEventListener('input', () => { if (el.hasAttribute('aria-invalid')) check(id); });
  }
  return { check, checkWithin, clear };
}
