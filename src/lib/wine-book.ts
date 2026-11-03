// The guest's wine book: a wine they have tasted (or will taste) as the card variant of the one list row.
// Used by "My wine book" (/my/) and the home page's favourites.
import { tastingUrl } from './guest';
import { originLine } from './origin';
import { styleName } from './wines';
import { starsRo } from './ui/stars';
import { listRow } from './ui/list-row';
import { chip } from './ui/status';
import { mk } from './ui/dom';
import { wineThumb } from './ui/thumb';
import { t, locale } from '../i18n';

export type BookWine = {
    wine_id: number; name: string; producer: string | null; vintage: string | null; style: string | null;
    image_url: string | null; appellation: string | null; region: string | null; country: string | null;
    slug: string; title: string; starts_at: string | null; sort_order: number;
    rating: number | null; note: string | null; rated_at: string | null; bought: number;
};

// A wine as the card variant of the one list row: picture, name, what it is, origin, my note, where I tasted it –
// and on the right my stars and what I bought. The card opens the wine's page.
export function wineItem(w: BookWine) {
  const where = w.starts_at
    ? t('book.tastedAt', { tasting: w.title, when: new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(w.starts_at)) })
    : w.title;
  const side = document.createDocumentFragment();
  if (w.rating) {
    const s = starsRo(w.rating);
    s.setAttribute('aria-label', t('rating.yours', { n: w.rating }));
    side.append(s);
  }
  if (w.bought > 0) side.append(chip(t('book.bought', { n: w.bought })));
  const note = w.note?.trim() ? mk('p', 'lmeta note', `“${w.note.trim()}”`) : null;
  return listRow({
    variant: 'card',
    // By number: the wine page turns it into the name address (unique also for two vintages of one wine)
    cardHref: tastingUrl(w.slug, `wines/${w.wine_id}/`), pic: wineThumb(w), title: w.name,
    meta: [[w.style ? styleName(w.style) : null, w.vintage, w.producer].filter((x, i, arr) => x && arr.indexOf(x) === i), originLine(w), note, where],
    aside: side.childNodes.length ? side : null,
  });
}

