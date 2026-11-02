// The host's page for one wine, /admin/wines/<id>/: picture, facts, origin with map, the tastings
// it is in and the guests' ratings there. Editing happens in the usual side panel (admin-wines.ts).
import { supabase } from './supabase';
import { t, formatWhen, locale } from '../i18n';
import { styleName, kr, wineSlug } from './wines';
import { countryName, loadAppellations, matchAppellation, originFull } from './origin';
import { wineMap, showMapCredit } from './wine-map';
import { mk } from './admin-common';
import { fetchedWhen, type AdminWine } from './admin-wines';

type Detail = Omit<AdminWine, 'tasting_wines'> & {
  tasting_wines: { price_dkk: number | null; tastings: { id: string; slug: string; title: string; starts_at: string | null } | null }[];
};

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

// A wine's address: /admin/wines/<country>/<region>/<appellation>/<name>/<vintage>/
// (country in English so the address is the same in every language; empty parts are left out)
const COUNTRY_SLUG: Record<string, string> = { US: 'usa', GB: 'uk' };
const countrySlug = (code: string | null | undefined) => {
  if (!code) return null;
  if (COUNTRY_SLUG[code]) return COUNTRY_SLUG[code];
  try { return wineSlug(new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code); } catch { return code.toLowerCase(); }
};
type PathWine = { id: number; name: string; vintage: string | null; country: string | null; region: string | null; appellation: string | null };

/** The address of every wine on the account; two wines that would share one get -2, -3 … on the name. */
export function winePaths(wines: PathWine[]): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();
  for (const w of [...wines].sort((a, b) => a.id - b.id)) {
    const year = w.vintage && /^\d{4}$/.test(w.vintage.trim()) ? w.vintage.trim() : null;
    const front = [countrySlug(w.country), w.region && wineSlug(w.region), w.appellation && wineSlug(w.appellation)].filter(Boolean);
    let name = wineSlug(w.name);
    const build = (n: string) => `/admin/wines/${[...front, n, year].filter(Boolean).join('/')}/`;
    for (let i = 2; used.has(build(name)); i++) name = `${wineSlug(w.name)}-${i}`;
    used.add(build(name));
    out.set(w.id, build(name));
  }
  return out;
}

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

export async function showWinePage(id: number, actions: { edit: () => void; refresh: () => void }) {
  const { data } = await supabase.from('wines')
    .select('*, tasting_wines(price_dkk, tastings(id, slug, title, starts_at))').eq('id', id).maybeSingle();
  const w = data as Detail | null;
  $('wine-list-view').hidden = true;
  $('wine-detail').hidden = false;
  if (!w) { $('wd-missing').hidden = false; $('wd-main').hidden = true; return; }
  $('wd-missing').hidden = true;
  $('wd-main').hidden = false;
  document.title = `${w.name} – ${document.title.split(' – ').pop()}`;

  // Head: picture, name, type · vintage · producer
  const pic = $('wd-pic');
  pic.replaceChildren();
  if (w.image_url) {
    const img = mk('img');
    img.src = w.image_url;
    img.alt = '';
    pic.append(img);
  }
  pic.hidden = !w.image_url;
  $('wd-name').textContent = w.name;
  $('wd-meta').textContent = [w.style ? styleName(w.style) : null, w.vintage, w.producer].filter(Boolean).join(' · ');
  $('wd-edit').onclick = actions.edit;

  // Facts
  const facts: [string, string | Node][] = [];
  if (w.abv != null) facts.push([t('admin.abv').replace(/\s*\(%\)/, ''), `${String(w.abv).replace('.', ',')} %`]);
  if (w.retail_price_dkk != null) facts.push([t('admin.retail').replace(/\s*\(.*\)/, ''), kr.format(w.retail_price_dkk)]);
  if (w.offer_price_dkk != null) {
    facts.push([t('wineLib.offer'), t((w.offer_quantity ?? 1) > 1 ? 'link.offerMany' : 'link.offerOne',
      { price: kr.format(w.offer_price_dkk), n: w.offer_quantity ?? 1 }).replace(/^[^:]*:\s*/, '')]);
  }
  for (const line of (w.details ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [k, ...v] = line.split(':');
    facts.push(v.length ? [k.trim(), v.join(':').trim()] : [t('admin.details'), line]);
  }
  if (w.producer_website) {
    const a = mk('a');
    a.href = w.producer_website;
    a.target = '_blank';
    a.rel = 'noopener';
    try { a.textContent = new URL(w.producer_website).hostname.replace(/^www\./, ''); } catch { a.textContent = w.producer_website; }
    const box = mk('span', 'wd-source');
    box.append(a);
    facts.push([t('producer.websiteShort'), box]);
  }
  if (w.producer_address) facts.push([t('producer.addressShort'), w.producer_address]);
  if (w.source_url) {
    const box = mk('span', 'wd-source');
    const a = mk('a');
    a.href = w.source_url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = w.source_url;
    try { a.textContent = new URL(w.source_url).hostname.replace(/^www\./, ''); } catch { a.textContent = w.source_url; }
    const btn = mk('button', 'icon-btn');
    btn.type = 'button';
    btn.title = t('source.refresh');
    btn.setAttribute('aria-label', t('source.refresh'));
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></svg>';
    btn.addEventListener('click', actions.refresh);
    box.append(a);
    if (w.source_fetched_at) box.append(' ', mk('span', 'source-when', `(${fetchedWhen(w.source_fetched_at)})`));
    box.append(' ', btn);
    facts.push([t('source.from'), box]);
  }
  const dl = $('wd-facts');
  dl.replaceChildren(...facts.flatMap(([k, v]) => [mk('dt', '', k), (() => { const dd = mk('dd'); dd.append(v); return dd; })()]));
  $('wd-facts-block').hidden = !facts.length;
  $('wd-description').textContent = w.description ?? '';
  $('wd-description').hidden = !w.description;

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
  showMapCredit($('wd-map'), map?.how);

  // Tastings, newest first, with the guest price and the guests' ratings there
  const rows = (w.tasting_wines ?? []).filter((x) => x.tastings)
    .sort((a, b) => (b.tastings!.starts_at ?? '').localeCompare(a.tastings!.starts_at ?? ''));
  const ratings = await Promise.all(rows.map(async (x) => {
    const { data: r } = await supabase.rpc('tasting_wine_ratings', { t_id: x.tastings!.id });
    const hit = ((r ?? []) as { wine_id: number; average: number; votes: number }[]).find((y) => y.wine_id === w.id);
    return hit ? { average: Number(hit.average), votes: hit.votes } : null;
  }));
  const ul = $('wd-tastings');
  ul.replaceChildren(...rows.map((x, i) => {
    const tt = x.tastings!;
    const li = mk('li', 'wd-tasting');
    const a = mk('a', 'wd-t-title', tt.title);
    a.href = `/t/${tt.slug}/admin/wines/`;
    const sub = [tt.starts_at ? formatWhen(tt.starts_at, { year: true }) : null,
      x.price_dkk != null ? t('wineAdmin.guestPrice', { price: kr.format(x.price_dkk) }) : null].filter(Boolean).join(' · ');
    const left = mk('div');
    left.append(a, mk('span', 'wd-t-sub', sub));
    const r = ratings[i];
    const score = mk('span', 'wd-score', r ? `★ ${r.average.toLocaleString(locale(), { minimumFractionDigits: 1 })}` : '–');
    if (r) score.title = t(r.votes === 1 ? 'wineAdmin.voteOne' : 'wineAdmin.votes', { n: r.votes });
    const votes = mk('span', 'wd-votes', r ? t(r.votes === 1 ? 'wineAdmin.voteOne' : 'wineAdmin.votes', { n: r.votes }) : t('wineAdmin.noRatings'));
    const right = mk('div', 'wd-t-rating');
    right.append(score, votes);
    li.append(left, right);
    return li;
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
