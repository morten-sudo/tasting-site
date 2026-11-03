// Component 20 – the one avatar (initials) and the one wine thumbnail, used by every row, card, hit and panel.
// A wine without a picture shows a quiet bottle outline (dashed box); a blind wine a bottle with a "?".
import { t } from '../../i18n';

export type ThumbSize = 'small' | 'normal' | 'large';
const SIZE: Record<ThumbSize, string> = { small: ' sm', normal: '', large: ' lg' };

const BOTTLE_NONE = '<svg viewBox="0 0 40 100" aria-hidden="true"><path d="M15 3h10v27c0 3 7 5 7 13v52a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V43c0-8 7-10 7-13z" fill="none" stroke="#9b8f8b" stroke-width="2.2" stroke-linejoin="round"/></svg>';
const BOTTLE_BLIND = '<svg viewBox="0 0 40 100" aria-hidden="true"><path d="M16 2h8v26c0 6 8 8 8 18v49a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V46c0-10 8-12 8-18z" fill="#861530"/><rect x="13" y="56" width="14" height="18" fill="#a85566"/><text x="20" y="70" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="#fff">?</text></svg>';

/** "Anna Holm" → "AH"; "peter@example.dk" → "P" */
export function initials(name: string): string {
  const words = name.includes('@') ? [name] : name.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
}

/** A person's initials in a circle; add: the dashed "+" of a new row */
export function avatar(name: string, opts: { size?: ThumbSize; host?: boolean; add?: boolean } = {}): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'av' + SIZE[opts.size ?? 'normal'] + (opts.host ? ' host' : '') + (opts.add ? ' add' : '');
  el.textContent = opts.add ? '+' : initials(name);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/** A wine's picture: its image, else the empty bottle outline; blind: the bottle with "?" (the picture is not shown) */
export function wineThumb(src: { image_url?: string | null } | string | null | undefined,
  opts: { size?: ThumbSize; blind?: boolean; loading?: boolean } = {}): HTMLSpanElement {
  const url = typeof src === 'string' ? src : src?.image_url ?? null;
  const el = document.createElement('span');
  el.className = 'thumb' + SIZE[opts.size ?? 'normal'];
  setThumb(el, opts.blind ? null : url, opts.blind);
  if (opts.loading) el.insertAdjacentHTML('beforeend', '<span class="spin" aria-hidden="true"></span>');
  return el;
}

/** Changes the picture in a thumbnail (e.g. when a link has been read) */
export function setThumb(el: HTMLElement, url: string | null, blind = false) {
  el.classList.toggle('none', !url && !blind);
  el.replaceChildren();
  if (blind) {
    el.innerHTML = BOTTLE_BLIND;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', t('blind.blind'));
    return;
  }
  el.removeAttribute('role');
  el.removeAttribute('aria-label');
  if (!url) { el.innerHTML = BOTTLE_NONE; el.setAttribute('aria-hidden', 'true'); return; }
  el.removeAttribute('aria-hidden');
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  // A picture that cannot be loaded: the outline instead of a broken image
  img.addEventListener('error', () => setThumb(el, null));
  el.append(img);
}
