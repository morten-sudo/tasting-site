// The host's page for one wine, /admin/wines/<id>/: picture, facts, origin with map, the tastings
// it is in and the guests' ratings there. Editing happens in the usual side panel (admin-wines.ts).
import { formatKr } from './ui/kr';
import { starsRo } from './ui/stars';
import { listRow } from './ui/list-row';
import { iconButton } from './ui/icon-button';
import { supabase } from './supabase';
import { t, formatWhen, locale } from '../i18n';
import { styleName, wineSlug, wineFacts } from './wines';
import { countryName, loadAppellations, matchAppellation, originFull } from './origin';
import { wineMap, showMapCredit } from './wine-map';
import { mapZoom } from './ui/map-zoom';
import { $, mk } from './ui/dom';
import { fillFacts, type Fact } from './ui/facts';
import { detailIcon } from './ui/detail-icon';
import { wineThumb } from './ui/thumb';
import { fetchedWhen, type AdminWine } from './admin-wines';
import { tooltip } from './ui/tooltip';
import { bottleText } from './bottle';
import { retailForeignNote } from './wine-read';

type Detail = Omit<AdminWine, 'tasting_wines'> & {
  tasting_wines: { price_dkk: number | null; tastings: { id: string; slug: string; title: string; starts_at: string | null } | null }[];
};


export { winePaths, type PathWine } from './wine-paths';

/** The wine on this address: by its path, or by an old numeric address (/admin/wines/49/). */
export function wineIdFromPath(paths: Map<number, string>, path = location.pathname): number | null {
  const p = path.replace(/\/?$/, '/');
  if (p === '/admin/wines/') return null;
  const old = p.match(/^\/admin\/wines\/(\d+)\/$/);
  if (old) return Number(old[1]);
  for (const [id, wp] of paths) if (wp === decodeURIComponent(p)) return id;
  return -1; // an address that matches no wine
}

/** True on any address below /admin/wines/ (a wine's page, found or not). */
export const onWinePage = (path = location.pathname) => path.replace(/\/?$/, '/') !== '/admin/wines/';

export async function showWinePage(id: number, actions: { edit: () => void; refresh: () => void; fill?: () => void }) {
  const { data } = await supabase.from('wines')
    .select('*, tasting_wines(price_dkk, tastings(id, slug, title, starts_at))').eq('id', id).maybeSingle();
  const w = data as Detail | null;
  $('wine-list-view').hidden = true;
  $('wine-detail').hidden = false;
  if (!w) { $('wd-missing').hidden = false; $('wd-main').hidden = true; return; }
  $('wd-missing').hidden = true;
  $('wd-main').hidden = false;
  document.title = `${w.name} – ${document.title.split(' – ').pop()}`;

  // Head: picture, name, type · vintage · size (when not 75 cl) · producer
  // The one wine picture (20), large; without one the quiet bottle outline
  $('wd-pic').replaceChildren(wineThumb(w, { size: 'large' }));
  $('wd-name').textContent = w.name;
  $('wd-meta').textContent = [w.style ? styleName(w.style) : null, w.vintage, bottleText(w.bottle_cl, locale()), w.producer].filter(Boolean).join(' · ');
  $('wd-edit').onclick = actions.edit;

  // Facts
  const facts: Fact[] = [];
  if (w.abv != null) facts.push({ label: t('admin.abv').replace(/\s*\(%\)/, ''), value: `${String(w.abv).replace('.', ',')} %` });
  // The shop price, and – when it came in another currency – what it was converted from (WIN-281): "96,76 kr. ·
  // Regnet om fra 12,97 € (kurs 7,46)"; without a fixed rate there is no price yet, only the shop's price to type
  const foreign = retailForeignNote(w.retail_foreign);
  if (w.retail_price_dkk != null || foreign) {
    const box = mk('span');
    if (w.retail_price_dkk != null) box.append(formatKr(w.retail_price_dkk));
    if (foreign) box.append(...(w.retail_price_dkk != null ? [' · '] : []), mk('span', 'source-when', foreign));
    facts.push({ label: t('admin.retail').replace(/\s*\(.*\)/, ''), value: box });
  }
  if (w.offer_price_dkk != null) {
    facts.push({ label: t('wineLib.offer'), value: t((w.offer_quantity ?? 1) > 1 ? 'link.offerMany' : 'link.offerOne',
      { price: formatKr(w.offer_price_dkk), n: w.offer_quantity ?? 1 }).replace(/^[^:]*:\s*/, '') });
  }
  // The wine's own notes (style, origin, ageing, taste …) on their own, the shop and producer facts below
  const notes: Fact[] = [];
  for (const line of (w.details ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [k, ...v] = line.split(':');
    notes.push(v.length && k.length <= 30 ? { label: k.trim(), value: v.join(':').trim(), icon: detailIcon(k) } : { label: '', value: line });
  }
  fillFacts($('wd-notes'), notes);
  $('wd-notes-block').hidden = !notes.length;
  // Links only to web addresses (the database allows nothing else; a link never runs script)
  if (w.producer_website && /^https?:\/\//i.test(w.producer_website)) {
    const a = mk('a');
    a.href = w.producer_website;
    a.target = '_blank';
    a.rel = 'noopener';
    try { a.textContent = new URL(w.producer_website).hostname.replace(/^www\./, ''); } catch { a.textContent = w.producer_website; }
    const box = mk('span', 'wd-source');
    box.append(a);
    facts.push({ label: t('producer.websiteShort'), value: box });
  }
  if (w.producer_address) facts.push({ label: t('producer.addressShort'), value: w.producer_address });
  if (w.source_url && /^https?:\/\//i.test(w.source_url)) {
    const box = mk('span', 'wd-source');
    const a = mk('a');
    a.href = w.source_url;
    a.target = '_blank';
    a.rel = 'noopener';
    tooltip(a, w.source_url);
    try { a.textContent = new URL(w.source_url).hostname.replace(/^www\./, ''); } catch { a.textContent = w.source_url; }
    const btn = iconButton('refresh', t('source.refresh'));
    btn.addEventListener('click', actions.refresh);
    box.append(a);
    if (w.source_fetched_at) box.append(' ', mk('span', 'source-when', `(${fetchedWhen(w.source_fetched_at)})`));
    box.append(' ', btn);
    facts.push({ label: t('source.from'), value: box });
  }
  fillFacts($('wd-facts'), facts);
  $('wd-facts-block').hidden = !facts.length;
  $('wd-description').textContent = w.description ?? '';
  $('wd-description').hidden = !w.description;
  // Grapes, food and serving
  const strip = wineFacts(w);
  $('wd-facts-strip').replaceChildren(...(strip ? [strip] : []));

  // Origin: appellation, subregion, region, country – and the map
  const apps = await loadAppellations();
  const app = w.appellation_id ? apps.find((a) => a.id === w.appellation_id) : matchAppellation(apps, w.appellation);
  const where = [w.appellation, app?.subregion, w.region, countryName(w.country)]
    .filter((x, i, all) => x && all.findIndex((y) => y && y.toLowerCase() === x.toLowerCase()) === i);
  $('wd-origin-text').textContent = where.join(', ') || originFull(w) || '';
  $('wd-origin').hidden = !where.length;
  const map = await wineMap(w);
  $('wd-map').innerHTML = map?.svg ?? '';
  $('wd-map').hidden = !map;
  if (map) mapZoom($('wd-map'));
  showMapCredit($('wd-map'), map);

  // Only a name so far: say so, with a way to fill in the rest (a shop link or a label photo – or by hand)
  const empty = !w.image_url && !facts.length && !notes.length && !w.description && !strip && !where.length && !w.producer && !w.style;
  $('wd-empty').hidden = !empty;
  $('wd-empty-fill').onclick = actions.fill ?? actions.edit;
  $('wd-empty-edit').onclick = actions.edit;

  // Tastings, newest first, with the guest price and the guests' ratings there
  const rows = (w.tasting_wines ?? []).filter((x) => x.tastings)
    .sort((a, b) => (b.tastings!.starts_at ?? '').localeCompare(a.tastings!.starts_at ?? ''));
  const ratings = await Promise.all(rows.map(async (x) => {
    const { data: r } = await supabase.rpc('tasting_wine_ratings', { t_id: x.tastings!.id });
    const hit = ((r ?? []) as { wine_id: number; average: number; votes: number }[]).find((y) => y.wine_id === w.id);
    return hit ? { average: Number(hit.average), votes: hit.votes } : null;
  }));
  const ul = $('wd-tastings');
  // One row per tasting (the one list row): its name, when and the guest price – the guests' rating on the right
  ul.replaceChildren(...rows.map((x, i) => {
    const tt = x.tastings!;
    const r = ratings[i];
    // The read-only stars (src/lib/ui/stars.ts) with the average
    const aside = document.createDocumentFragment();
    aside.append(r ? starsRo(r.average, ' ' + r.average.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })) : mk('b', '', '–'),
      mk('small', '', r ? t(r.votes === 1 ? 'wineAdmin.voteOne' : 'wineAdmin.votes', { n: r.votes }) : t('wineAdmin.noRatings')));
    return listRow({
      title: tt.title, href: `/t/${tt.slug}/admin/wines/`,
      meta: [[tt.starts_at ? formatWhen(tt.starts_at, { year: true }) : null, x.price_dkk != null ? t('wineAdmin.guestPrice', { price: formatKr(x.price_dkk) }) : null]],
      aside,
    });
  }));
  $('wd-tastings-empty').hidden = rows.length > 0;
  // Overall: all votes across the tastings
  const all = ratings.filter(Boolean) as { average: number; votes: number }[];
  const votes = all.reduce((s, r) => s + r.votes, 0);
  $('wd-overall').hidden = !votes;
  if (votes) {
    const avg = all.reduce((s, r) => s + r.average * r.votes, 0) / votes;
    $('wd-overall').textContent = t('wineAdmin.overall', {
      avg: (Math.round(avg * 10) / 10).toLocaleString(locale(), { minimumFractionDigits: 1 }), n: votes,
    });
  }
}
