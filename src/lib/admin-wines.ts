// Admin, wine library: the host's wines across all tastings – add, edit and delete one at a time,
// filled in from a label photo or a shop link. Prices and visibility per tasting live on the tasting page.
import { supabase } from './supabase';
import { STYLES, styleName, kr } from './wines';
import { t, lang, locale } from '../i18n';
import { wineMap, showMapCredit } from './wine-map';
import { withoutYear } from './wines';
import { winePaths } from './admin-wine-page';
import { iconButton } from './admin-common';
import { wineChecks, parseAmount, amountText } from './wine-validate';
import { toast } from './toast';
import { fieldError } from './field-error';
import { combo, type ComboOption } from './combo';
import { filterDropdown, type DdOption } from './filter-dd';
import { SUPABASE_URL, SUPABASE_KEY } from './config';
import { shrinkImage, labelDataUrl, locateAppellation, type LabelResult, type LinkResult } from './wine-read';
import { WINE_COUNTRIES, countryName, loadAppellations, loadRegions, matchAppellation, matchRegion, normOrigin, originLine, type Appellation, type WineRegion } from './origin';

export type AdminWine = {
  id: number; host_id: string; name: string; producer: string | null;
  style: string | null; vintage: string | null; abv: number | null;
  retail_price_dkk: number | null; description: string | null; details: string | null;
  image_url: string | null; source_url: string | null; source_fetched_at?: string | null;
  grapes?: string | null; food_pairing?: string | null; serving?: string | null;
  country: string | null; region: string | null; appellation: string | null; appellation_id: string | null;
  offer_price_dkk: number | null; offer_quantity: number | null;
  producer_website?: string | null; producer_address?: string | null;
  producer_lat?: number | null; producer_lon?: number | null; producer_source?: string | null; producer_checked_at?: string | null;
  tasting_wines?: { tastings: { slug: string; title: string } | null }[];
};

const COLUMNS = 'id, host_id, name, producer, style, vintage, abv, country, region, appellation, appellation_id, retail_price_dkk, offer_price_dkk, offer_quantity, description, details, image_url, source_url, source_fetched_at, grapes, food_pairing, serving, producer_website, producer_address, producer_lat, producer_lon, producer_source, producer_checked_at, tasting_wines(tastings(slug, title))';
const BUCKET = 'wine-images';

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
/** A typed web address as https://…, or null. */
const webUrl = (v: string) => {
  const s = v.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : null;
  } catch { return null; }
};

function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

type GeoHit = { lat: number; lon: number; source: string };
const toText = (v: string) => v.trim() || null;
/** "2 Nov 2026, 12:31" – when a wine's link was read. */
export const fetchedWhen = (iso: string) => new Intl.DateTimeFormat(locale(), {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen',
}).format(new Date(iso));

export function initWineAdmin(hostId: string, tenantId: string, hooks: { onSaved?: () => void; onDeleted?: (id: number) => void } = {}) {
  let wines: AdminWine[] = [];
  // Wines deleted with "Undo" still possible: hidden from the list, deleted for real when the toast goes
  const pendingDelete = new Map<number, string>(); // id → access token
  let editing: AdminWine | null = null;
  let pendingImage: Blob | null = null;
  let linkImage: string | null = null; // product image found via a shop link
  let sourceUrl: string | null = null;
  let sourceFetchedAt: string | null = null; // when the link was last read
  let removeImage = false;
  // The producer's place found while the form is open; saved with the wine if the producer and website still match
  type Found = { website: string | null; address: string | null; lat: number | null; lon: number | null; source: string | null };
  let foundPlace: (Found & { producer: string }) | null = null;
  let producerTurn = 0;

  const form = $<HTMLFormElement>('wine-form');
  const panel = $<HTMLDialogElement>('wine-panel');
  // Editing a wine: the side panel (new wines come in through the line above the list, wine-quick-add.ts)
  $('wf-close').addEventListener('click', () => closeForm());
  panel.addEventListener('close', () => { editing = null; });
  const list = $<HTMLUListElement>('wine-admin-list');
  const checks = wineChecks(form);
  const AMOUNTS = ['wf-abv', 'wf-retail', 'wf-offer-price'];
  const field = <E extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id: string) => $<E>(id);

  // Style options
  const styleSelect = field<HTMLSelectElement>('wf-style');
  styleSelect.replaceChildren(new Option(t('admin.choose'), ''));
  for (const key of STYLES) styleSelect.append(new Option(styleName(key), key));

  // ---------- Origin: country → region → appellation ----------
  // Each choice narrows the next list; a known appellation fills in region and country.
  const countrySelect = field<HTMLSelectElement>('wf-country');
  countrySelect.replaceChildren(new Option(t('admin.choose'), ''),
    ...WINE_COUNTRIES.map((c) => new Option(countryName(c) ?? c, c))
      .sort((a, b) => a.text.localeCompare(b.text, lang())));
  const appInput = field<HTMLInputElement>('wf-appellation');
  const regionInput = field<HTMLInputElement>('wf-region');
  // Suggestions under the region and appellation fields (filled by fillLists)
  let regionOptions: ComboOption[] = [];
  let appOptions: ComboOption[] = [];
  const regionCombo = combo(regionInput, () => regionOptions);
  const appCombo = combo(appInput, () => appOptions);
  let appellations: Appellation[] = [];
  let regions: WineRegion[] = [];
  Promise.all([loadAppellations(), loadRegions()]).then(([apps, regs]) => {
    appellations = apps;
    regions = regs;
    syncOrigin();
  });
  const knownApp = () => (appInput.value.trim() ? matchAppellation(appellations, appInput.value) : null);
  /** The region as a known one (in the chosen country), so "Burgundy" counts as Bourgogne. */
  const knownRegion = () => matchRegion(regions, regionInput.value, countrySelect.value || null);
  const sameRegion = (a: Appellation, region: string) => normOrigin(a.region) === normOrigin(region)
    || normOrigin(knownRegion()?.name) === normOrigin(a.region);

  /** The region and appellation suggestions for what is chosen so far. */
  function fillLists() {
    const country = countrySelect.value;
    const where = (c: string) => (country ? '' : ` · ${countryName(c)}`);
    const regs = regions.filter((r) => !country || r.country === country);
    // Regions on the appellation list that are not in wine_regions (keeps old data selectable)
    for (const a of appellations) {
      if ((!country || a.country === country) && !regs.some((r) => r.country === a.country && normOrigin(r.name) === normOrigin(a.region))) {
        regs.push({ id: `${a.country}-${a.region}`, name: a.region, country: a.country, aliases: [], lat: null, lon: null });
      }
    }
    regionOptions = regs.sort((a, b) => a.name.localeCompare(b.name, lang()))
      .map((r) => ({ value: r.name, hint: country ? undefined : countryName(r.country) ?? r.country }));
    const region = regionInput.value.trim();
    const apps = appellations.filter((a) => (!country || a.country === country) && (!region || sameRegion(a, region)));
    // An unknown region narrows nothing: show the whole country instead of an empty list
    const shown = apps.length ? apps : appellations.filter((a) => !country || a.country === country);
    // With a region chosen, the region is not repeated on every line: grouped by subregion (e.g. Médoc, Libournais)
    const narrowed = !!apps.length && !!region;
    appOptions = shown
      .map((a) => ({ value: a.name, group: narrowed ? a.subregion ?? undefined : undefined,
        hint: narrowed ? undefined : [a.subregion, a.region].filter(Boolean).join(' · ') + where(a.country) }))
      .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '', lang()) || a.value.localeCompare(b.value, lang()));
    regionCombo.refresh();
    appCombo.refresh();
  }

  /** A known appellation fills in region and country (the database does the same when saving). */
  function syncOrigin() {
    const text = appInput.value.trim();
    const known = knownApp();
    const status = $('wf-app-status');
    status.hidden = !text || !appellations.length;
    status.classList.toggle('known', !!known);
    status.textContent = known
      ? '✓ ' + t('origin.known', { name: known.name, where: [known.subregion, known.region, countryName(known.country)].filter(Boolean).join(', ') })
      : t('origin.unknown');
    if (known) {
      regionInput.value = known.region;
      countrySelect.value = known.country;
    }
    fillLists();
    showOriginMap();
  }
  /** A new country: drop a region and appellation that belong to another country. */
  function countryChanged() {
    const country = countrySelect.value;
    const app = knownApp();
    if (app && country && app.country !== country) appInput.value = '';
    const reg = matchRegion(regions, regionInput.value);
    if (country && reg && !matchRegion(regions, regionInput.value, country)) regionInput.value = '';
    syncOrigin();
  }
  /** A new region: drop an appellation from another region. */
  function regionChanged() {
    const app = knownApp();
    const region = regionInput.value.trim();
    if (app && region && !sameRegion(app, region)) appInput.value = '';
    // A known region is written its usual way ("Burgundy" → Bourgogne) and tells the country
    const reg = matchRegion(regions, region, countrySelect.value || null);
    if (reg) { regionInput.value = reg.name; countrySelect.value = reg.country; }
    syncOrigin();
  }

  // The wine's map, updated as the origin is typed (the newest typing wins)
  let mapTurn = 0;
  let mapTimer: ReturnType<typeof setTimeout> | undefined;
  function showOriginMap() {
    clearTimeout(mapTimer);
    mapTimer = setTimeout(async () => {
      const turn = ++mapTurn;
      // The producer's place found earlier, while the producer is unchanged
      const producerNow = field<HTMLInputElement>('wf-producer').value;
      const keep = editing && normOrigin(editing.producer) === normOrigin(producerNow);
      // A place found in the form wins over the saved one
      const here = foundPlace && normOrigin(foundPlace.producer) === normOrigin(producerNow) ? foundPlace : null;
      const lat = here ? here.lat : keep ? editing!.producer_lat ?? null : null;
      const lon = here ? here.lon : keep ? editing!.producer_lon ?? null : null;
      const origin = { appellation: appInput.value.trim() || null, region: regionInput.value.trim() || null, country: countrySelect.value || null,
        producer: producerNow.trim() || null, producer_lat: lat, producer_lon: lat == null ? null : lon };
      const m = await wineMap(origin);
      if (turn !== mapTurn) return;
      const box = $('wf-map');
      box.hidden = !m;
      if (!m) return;
      $('wf-map-svg').innerHTML = m.svg;
      // How the wine was placed; an unknown appellation is looked up when the wine is saved
      const pending = (m.how === 'country' || m.how === 'regionCentre') && !!origin.appellation && !knownApp();
      $('wf-map-note').textContent = t(pending ? 'wineMap.pending' : `wineMap.${m.how}`);
      showMapCredit($('wf-map-svg'), m.how);
    }, 250);
  }
  appInput.addEventListener('input', syncOrigin);
  appInput.addEventListener('change', syncOrigin);
  // The region is checked when it is chosen or left, not on every letter
  regionInput.addEventListener('input', () => { fillLists(); showOriginMap(); });
  regionInput.addEventListener('change', regionChanged);
  countrySelect.addEventListener('change', countryChanged);

  function showMsg(text: string, ok = false) {
    const m = $('wf-msg');
    m.textContent = text;
    m.className = 'message ' + (ok ? 'ok' : 'error');
    m.hidden = !text;
  }

  // ---------- Read the label (Cloudflare Workers AI via /api/read-label) ----------
  // Status line under the link field or under the photo, with a spinner while working
  type StatusId = 'wf-label-status' | 'wf-link-status' | 'wf-source-status';
  let statusTarget: StatusId = 'wf-label-status';
  function labelStatus(text: string, kind: 'busy' | 'ok' | 'error' | '' = '') {
    for (const id of ['wf-label-status', 'wf-link-status', 'wf-source-status']) {
      const el = $(id);
      const mine = id === statusTarget;
      el.textContent = mine ? text : '';
      el.className = 'label-status' + (mine && kind ? ' ' + kind : '');
      el.hidden = !mine || !text;
    }
    form.classList.toggle('reading', kind === 'busy');
  }
  function busyButton(btn: HTMLButtonElement, on: boolean) {
    btn.disabled = on;
    btn.classList.toggle('loading', on);
    btn.setAttribute('aria-busy', String(on));
  }

  async function readLabel(target: StatusId = 'wf-label-status') {
    if (!pendingImage) return;
    const btn = $<HTMLButtonElement>('wf-read-label');
    statusTarget = target;
    busyButton(btn, true);
    $('wf-image-box').classList.add('busy');
    labelStatus(t('label.reading'), 'busy');
    try {
      const image = await labelDataUrl(pendingImage);
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/read-label', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ image }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as LabelResult;
      fillStatus(fillFromLabel(r), t('label.filled', { n: '{n}' }), t('label.nothing'));
      fillProducer();
    } catch {
      labelStatus(t('label.failed'), 'error');
    } finally {
      busyButton(btn, false);
      $('wf-image-box').classList.remove('busy');
    }
  }

  // ---------- Filling the form from a label or a link ----------
  // Empty fields are filled straight away; fields that already hold something else are offered
  // as a list the host can accept with one click, so nothing is overwritten by accident.
  type Change = { id: string; apply: () => void };
  /** The field's label without its hint, e.g. "Vintage". */
  const fieldName = (id: string) => {
    const label = form.querySelector<HTMLElement>(`label[for="${id}"]`);
    const first = label?.querySelector('span:not(.hint)') ?? label;
    return (first?.textContent ?? id).replace(/\s*\(.*\)\s*$/, '').trim();
  };
  const same = (a: string, b: string) => {
    const na = Number(a.replace(',', '.')), nb = Number(b.replace(',', '.'));
    if (a.trim() && b.trim() && Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
    return normOrigin(a) === normOrigin(b) && a.trim().toLowerCase() === b.trim().toLowerCase()
      || a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
  };
  function filler() {
    let filled = 0;
    const changes: Change[] = [];
    const set = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) => {
      el.value = v;
      el.classList.add('from-label');
      if (el.id === 'wf-name' || el.id === 'wf-vintage') queueMicrotask(showSimilar);
    };
    const put = (id: string, value: string | number | null | undefined) => {
      if (value == null || value === '') return;
      const el = field<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
      const v = typeof value === 'number' && AMOUNTS.includes(id) ? amountText(value, locale())
        : AMOUNTS.includes(id) && parseAmount(String(value)) != null && !Number.isNaN(parseAmount(String(value))) ? amountText(parseAmount(String(value)), locale())
        : String(value);
      if (!el.value.trim()) { set(el, v); filled++; }
      else if (!same(el.value, v)) changes.push({ id, apply: () => set(el, v) });
    };
    return { put, changes, add: (c: Change) => changes.push(c), count: () => filled, bump: () => { filled++; } };
  }
  type Filler = ReturnType<typeof filler>;

  /** Puts a label reading into the form (see filler). */
  function fillFromLabel(r: LabelResult, f: Filler = filler()) {
    f.put('wf-name', r.name);
    f.put('wf-producer', r.producer);
    f.put('wf-vintage', r.vintage);
    if (r.style) f.put('wf-style', r.style);
    f.put('wf-abv', r.abv);
    if (r.country && WINE_COUNTRIES.includes(r.country)) f.put('wf-country', r.country);
    f.put('wf-region', r.region);
    f.put('wf-appellation', r.appellation);
    syncOrigin();
    f.put('wf-grapes', r.grapes);
    return f;
  }

  /** The status line after filling, with a button for the fields that differ. */
  function fillStatus(f: Filler, done: string, nothing: string, extra = '') {
    const n = f.count();
    const text = (n ? done.replace('{n}', String(n)) : f.changes.length ? '' : nothing) + extra;
    labelStatus(text.trim(), n ? 'ok' : f.changes.length ? '' : 'error');
    if (!f.changes.length) return;
    const el = $(statusTarget);
    const names = [...new Set(f.changes.map((c) => fieldName(c.id)))];
    const line = mk('span', 'fill-diff', t('fill.differs', { n: names.length, fields: names.join(', ') }));
    const btn = mk('button', 'btn small ghost fill-use', t('fill.useNew'));
    btn.type = 'button';
    btn.addEventListener('click', () => {
      f.changes.forEach((c) => c.apply());
      syncOrigin();
      labelStatus(t('fill.applied', { n: names.length }), 'ok');
    });
    el.append(...(text.trim() ? [document.createTextNode(' ')] : []), line, ' ', btn);
    el.hidden = false;
  }

  // ---------- Fetch from a shop link (/api/read-link) ----------
  async function readLink(again = false) {
    const url = again ? sourceUrl ?? '' : field<HTMLInputElement>('wf-link').value.trim();
    statusTarget = again ? 'wf-source-status' : 'wf-link-status';
    if (!/^https?:\/\//i.test(url)) { labelStatus(t('link.invalid'), 'error'); return; }
    const btn = $<HTMLButtonElement>(again ? 'wf-source-refresh' : 'wf-read-link');
    busyButton(btn, true);
    labelStatus(t('link.reading'), 'busy');
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/read-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ url, lang: lang() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as LinkResult;
      const f = fillFromLabel(r);
      f.put('wf-description', r.description);
      f.put('wf-food', r.food);
      f.put('wf-serving', r.serving);
      f.put('wf-retail', r.price != null ? String(r.price) : null);
      if (r.offer) {
        f.put('wf-offer-price', String(r.offer.price));
        f.put('wf-offer-qty', String(r.offer.quantity));
      }
      if (r.image && !pendingImage) {
        const useImage = () => { linkImage = r.image; removeImage = false; setPreview(r.image); };
        const preview = $<HTMLImageElement>('wf-preview');
        if (preview.hidden) { useImage(); f.bump(); }
        else if (preview.src !== r.image) f.add({ id: 'wf-image', apply: useImage });
      }
      // The page's other pictures: our guess may be the back label or a detail – the host can pick another
      const others = (r.images ?? []).filter((u) => u !== r.image);
      if (others.length && !pendingImage) {
        showImageOptions([r.image, ...others].filter((u): u is string => !!u).map((url) => ({ url })));
        producerStatus(t('image.fromSource'), '', 'wf-image-status');
      }
      sourceUrl = r.source_url;
      sourceFetchedAt = new Date().toISOString();
      showSource();
      statusTarget = 'wf-source-status';
      const offer = r.offer
        ? ' ' + t(r.offer.quantity > 1 ? 'link.offerMany' : 'link.offerOne', { price: kr.format(r.offer.price), n: r.offer.quantity })
        : '';
      const foreign = r.foreign_currency && !field<HTMLInputElement>('wf-retail').value.trim()
        ? ' ' + t('link.foreignPrice', { currency: r.foreign_currency }) : '';
      fillStatus(f, t('link.filled', { n: '{n}' }), t('link.nothing'), offer + foreign);
      fillProducer();
    } catch {
      labelStatus(t('link.failed'), 'error');
    } finally {
      busyButton(btn, false);
    }
  }

  function setPreview(url: string | null) {
    const img = $<HTMLImageElement>('wf-preview');
    img.hidden = !url;
    if (url) img.src = url;
    $('wf-image-shown').hidden = !url;
    $('wf-image-drop').hidden = !!url;
    $('wf-image-remove').hidden = !url;
    $('wf-read-label').hidden = !pendingImage;
  }

  function openForm(w: AdminWine) {
    editing = w;
    checks.clear();
    $('wf-similar').hidden = true;
    $('wf-producer-busy').hidden = true;
    pendingImage = null;
    removeImage = false;
    linkImage = null;
    sourceUrl = w.source_url ?? null;
    sourceFetchedAt = w.source_fetched_at ?? null;
    foundPlace = null;
    producerTurn++;
    producerStatus('');
    producerStatus('', '', 'wf-address-status');
    producerStatus('', '', 'wf-image-status');
    $('wf-image-options').hidden = true;
    form.reset();
    labelStatus('');
    form.querySelectorAll('.from-label').forEach((el) => el.classList.remove('from-label'));
    showMsg('');
    $('wf-actions').hidden = false;
    $('wf-delete-confirm').hidden = true;
    field<HTMLInputElement>('wf-name').value = w.name ?? '';
    field<HTMLInputElement>('wf-producer').value = w.producer ?? '';
    field<HTMLInputElement>('wf-producer-website').value = w.producer_website ?? '';
    field<HTMLInputElement>('wf-producer-address').value = w.producer_address ?? '';
    styleSelect.value = w.style && (STYLES as readonly string[]).includes(w.style) ? w.style : '';
    field<HTMLInputElement>('wf-vintage').value = w.vintage ?? '';
    field<HTMLInputElement>('wf-abv').value = amountText(w.abv, locale());
    field<HTMLInputElement>('wf-retail').value = amountText(w.retail_price_dkk, locale());
    field<HTMLInputElement>('wf-offer-price').value = amountText(w.offer_price_dkk, locale());
    field<HTMLInputElement>('wf-offer-qty').value = w.offer_quantity != null ? String(w.offer_quantity) : '';
    field<HTMLTextAreaElement>('wf-description').value = w.description ?? '';
    field<HTMLTextAreaElement>('wf-details').value = w.details ?? '';
    field<HTMLInputElement>('wf-grapes').value = w.grapes ?? '';
    field<HTMLInputElement>('wf-food').value = w.food_pairing ?? '';
    field<HTMLInputElement>('wf-serving').value = w.serving ?? '';
    appInput.value = w.appellation ?? '';
    regionInput.value = w.region ?? '';
    countrySelect.value = w.country ?? '';
    syncOrigin();
    setPreview(w.image_url ?? null);
    // A wine fetched from a link shows where from (with Update) instead of an empty link field
    showSource();
    showLinkBox(!sourceUrl);
    if (w.producer && !w.producer_checked_at && (!w.producer_website || !w.producer_address)) fillProducer();
    panel.showModal();
    panel.scrollTop = 0;
    // On phones the keyboard would cover the sheet, so only focus a field on larger screens
    if (matchMedia('(min-width: 48rem)').matches) field<HTMLInputElement>('wf-name').focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur();
  }

  function closeForm() {
    editing = null;
    if (panel.open) panel.close();
  }

  // Filters on the list: country → region (a region belongs to its country), type, tasting – and the search box.
  // Each is the admin's one drop-down with checkboxes (filter-dd.ts); several values in one filter mean "any of them".
  // Kept in the address (?country=FR,IT&region=…&style=…&tasting=<slug>,none) so a link or "back" keeps them.
  const filterBox = document.getElementById('wine-filters');
  type FKey = 'country' | 'region' | 'style' | 'tasting';
  const FKEYS: FKey[] = ['country', 'region', 'style', 'tasting'];
  const filter: Record<FKey, Set<string>> & { q: string } = { country: new Set(), region: new Set(), style: new Set(), tasting: new Set(), q: '' };
  {
    const p = new URLSearchParams(location.search);
    for (const k of FKEYS) filter[k] = new Set((p.get(k) ?? '').split(',').filter(Boolean));
  }
  const regionKey = (w: AdminWine) => (w.region ? normOrigin(w.region) : '');
  const tastingsOf = (w: AdminWine) => (w.tasting_wines ?? []).map((x) => x.tastings).filter(Boolean) as { slug: string; title: string }[];
  const anyFilter = () => FKEYS.some((k) => filter[k].size > 0);
  function matches(w: AdminWine, skip?: FKey) {
    if (skip !== 'country' && filter.country.size && !filter.country.has(w.country ?? '')) return false;
    if (skip !== 'region' && filter.region.size && !filter.region.has(regionKey(w))) return false;
    if (skip !== 'style' && filter.style.size && !filter.style.has(w.style ?? '')) return false;
    if (skip !== 'tasting' && filter.tasting.size) {
      const ts = tastingsOf(w);
      if (!(ts.length ? ts.some((x) => filter.tasting.has(x.slug)) : filter.tasting.has('none'))) return false;
    }
    if (filter.q) {
      const text = [w.name, w.producer, w.vintage, w.region, w.appellation, w.grapes, countryName(w.country),
        w.style ? styleName(w.style) : null, ...tastingsOf(w).map((x) => x.title)].filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(filter.q)) return false;
    }
    return true;
  }
  function count<K>(rows: AdminWine[], key: (w: AdminWine) => K[]) {
    const m = new Map<K, number>();
    for (const w of rows) for (const k of new Set(key(w))) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }
  const byLabel = (opts: DdOption[]) => opts.sort((a, b) => a.label.localeCompare(b.label, locale()));
  const dds = filterBox ? {
    country: filterDropdown({ name: t('wineLib.country'), allLabel: t('wineLib.allCountries'), onChange: (v) => setFilter('country', v) }),
    region: filterDropdown({ name: t('wineLib.region'), allLabel: t('wineLib.allRegions'), onChange: (v) => setFilter('region', v) }),
    style: filterDropdown({ name: t('wineLib.type'), allLabel: t('wineLib.allStyles'), onChange: (v) => setFilter('style', v) }),
    tasting: filterDropdown({ name: t('wineLib.tasting'), allLabel: t('wineLib.allTastings'), onChange: (v) => setFilter('tasting', v) }),
  } : null;
  if (filterBox && dds) filterBox.prepend(...FKEYS.map((k) => dds[k].el));
  function renderFilters(shown: number) {
    if (!filterBox || !dds) return;
    filterBox.hidden = wines.length < 2;
    // Each list: the values among the wines the other filters let through, with a count
    const cRows = wines.filter((w) => matches(w, 'country'));
    const c = count(cRows, (w) => (w.country ? [w.country] : []));
    dds.country.render(byLabel([...c].map(([v, n]) => ({ value: v, label: countryName(v) ?? v, n }))), filter.country, cRows.length);
    // Regions: those of the chosen countries, with their country after the name when several countries are shown
    const rRows = wines.filter((w) => matches(w, 'region'));
    const rNames = new Map<string, string>();
    const oneCountry = new Set(rRows.map((w) => w.country)).size <= 1;
    for (const w of rRows) if (w.region && !rNames.has(regionKey(w))) rNames.set(regionKey(w), w.region + (oneCountry || !w.country ? '' : ` · ${countryName(w.country)}`));
    const r = count(rRows.filter((w) => w.region), (w) => [regionKey(w)]);
    dds.region.render(byLabel([...r].map(([v, n]) => ({ value: v, label: rNames.get(v) ?? v, n }))), filter.region, rRows.length);
    const sRows = wines.filter((w) => matches(w, 'style'));
    const s = count(sRows, (w) => (w.style ? [w.style] : []));
    dds.style.render(byLabel([...s].map(([v, n]) => ({ value: v, label: styleName(v), n }))), filter.style, sRows.length);
    const tRows = wines.filter((w) => matches(w, 'tasting'));
    const titles = new Map(wines.flatMap(tastingsOf).map((x) => [x.slug, x.title]));
    const tc = count(tRows, (w) => { const ts = tastingsOf(w); return ts.length ? ts.map((x) => x.slug) : ['none']; });
    const tOpts = byLabel([...tc].filter(([v]) => v !== 'none').map(([v, n]) => ({ value: v, label: titles.get(v) ?? v, n })));
    // "Not in a tasting" last, after a line
    const none = tc.get('none') ?? 0;
    if (none || filter.tasting.has('none')) tOpts.push({ value: 'none', label: t('wineLib.unused'), n: none, sep: tOpts.length > 0 });
    dds.tasting.render(tOpts, filter.tasting, tRows.length);
    const any = anyFilter() || !!filter.q;
    $('wl-count').textContent = any ? t('wineLib.showing', { n: shown, total: wines.length }) : '';
    $('wl-clear').hidden = !anyFilter();
  }
  function saveFilter() {
    const p = new URLSearchParams(location.search);
    for (const k of FKEYS) { if (filter[k].size) p.set(k, [...filter[k]].join(',')); else p.delete(k); }
    const q = p.toString();
    history.replaceState(history.state, '', location.pathname + (q ? `?${q}` : '') + location.hash);
  }
  function setFilter(k: FKey, v: Set<string>) {
    filter[k] = v;
    // Regions that do not belong to the chosen countries no longer fit
    if (k === 'country' && filter.region.size && filter.country.size) {
      filter.region = new Set([...filter.region].filter((r) => wines.some((w) => regionKey(w) === r && filter.country.has(w.country ?? ''))));
    }
    saveFilter();
    render();
  }
  if (filterBox) {
    $('wl-clear').addEventListener('click', () => {
      for (const k of FKEYS) filter[k] = new Set();
      saveFilter();
      render();
    });
  }
  document.getElementById('wine-search')?.addEventListener('input', (e) => {
    filter.q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    render();
  });

  function render() {
    list.replaceChildren();
    $('wine-empty').hidden = wines.length > 0;
    const shown = wines.filter((w) => !pendingDelete.has(w.id) && matches(w));
    renderFilters(shown.length);
    const noMatch = document.getElementById('wine-no-match');
    if (noMatch) noMatch.hidden = !wines.length || shown.length > 0;
    shown.forEach((w, i) => {
      const li = mk('li', 'wine-row');
      li.dataset.id = String(w.id);
      const thumb = mk('div', 'wine-thumb');
      if (w.image_url) {
        const img = mk('img');
        img.src = w.image_url;
        img.alt = '';
        img.loading = 'lazy';
        thumb.append(img);
      }
      const body = mk('div', 'wine-body');
      const name = mk('a', 'wine-name', w.name);
      name.href = paths().get(w.id) ?? '/admin/wines/';
      body.append(name);
      const meta = [w.style ? styleName(w.style) : null, w.vintage, w.producer].filter(Boolean).join(' · ');
      if (meta) body.append(mk('p', 'wine-meta', meta));
      const origin = originLine(w);
      if (origin) body.append(mk('p', 'wine-meta', origin));
      if (w.retail_price_dkk != null) body.append(mk('p', 'wine-meta', t('admin.normally', { price: kr.format(w.retail_price_dkk) })));
      if (w.offer_price_dkk != null) {
        body.append(mk('p', 'wine-meta', t((w.offer_quantity ?? 1) > 1 ? 'link.offerMany' : 'link.offerOne',
          { price: kr.format(w.offer_price_dkk), n: w.offer_quantity ?? 1 })));
      }
      // Which tastings the wine is in
      const ts = tastingsOf(w);
      const chips = mk('div', 'chips');
      for (const tt of ts) {
        const a = mk('a', 'chip', tt.title);
        a.href = `/t/${tt.slug}/admin/`;
        chips.append(a);
      }
      if (!ts.length) chips.append(mk('span', 'chip', t('wineLib.unused')));
      body.append(chips);

      const actions = mk('div', 'wine-actions');
      const edit = iconButton('edit', `${t('admin.edit')}: ${w.name}`);
      edit.dataset.tip = t('admin.edit');
      edit.addEventListener('click', () => openForm(w));
      actions.append(edit);

      li.append(thumb, body, actions);
      list.append(li);
    });
  }

  async function load() {
    const { data } = await supabase.from('wines').select(COLUMNS).eq('tenant_id', tenantId).order('name');
    wines = (data ?? []) as AdminWine[];
    render();
    placeSavedAddresses();
  }

  /** Wines with an address but no place yet (from before addresses were placed): placed in the background,
   *  one at a time and slowly (OpenStreetMap asks for at most one lookup a second). Tried once per wine. */
  let placing = false;
  async function placeSavedAddresses() {
    if (placing) return;
    placing = true;
    try {
      const todo = wines.filter((w) => w.producer_address && w.producer_lat == null && !w.producer_source);
      const done = new Map<string, GeoHit | null>();
      const { data } = await supabase.auth.getSession();
      for (const w of todo) {
        const key = `${w.producer_address}|${w.country ?? ''}`;
        if (!done.has(key)) {
          let hit = null as GeoHit | null;
          try {
            const res = await fetch('/api/geocode', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
              body: JSON.stringify({ address: w.producer_address, country: w.country }),
            });
            if (!res.ok) break;
            hit = ((await res.json()) as { location: GeoHit | null }).location;
          } catch { break; }
          done.set(key, hit);
          await new Promise((r) => setTimeout(r, 1200));
        }
        const hit = done.get(key) ?? null;
        await supabase.from('wines').update({ producer_lat: hit?.lat ?? null, producer_lon: hit?.lon ?? null, producer_source: hit?.source ?? 'none' }).eq('id', w.id);
        Object.assign(w, { producer_lat: hit?.lat ?? null, producer_lon: hit?.lon ?? null, producer_source: hit?.source ?? 'none' });
      }
    } finally { placing = false; }
  }


  async function uploadImage(blob: Blob): Promise<string | null> {
    const path = `${hostId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) return null;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // ---------- Events ----------
  $('wf-cancel').addEventListener('click', closeForm);

  async function useImage(input: HTMLInputElement, status: StatusId) {
    const file = input.files?.[0];
    if (!file) return;
    pendingImage = await shrinkImage(file);
    removeImage = false;
    setPreview(URL.createObjectURL(pendingImage));
    input.value = '';
    // A new wine: read the label straight away
    if (!editing) readLabel(status);
  }
  field<HTMLInputElement>('wf-image').addEventListener('change', (e) => useImage(e.target as HTMLInputElement, 'wf-label-status'));
  // An official picture from the producer's website (find-image): the best candidates, the host picks one
  $('wf-find-image').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('wf-find-image');
    const box = $('wf-image-options');
    const website = webUrl(field<HTMLInputElement>('wf-producer-website').value);
    const name = field<HTMLInputElement>('wf-name').value.trim();
    box.hidden = true;
    if (!website) { producerStatus(t('image.needWebsite'), '', 'wf-image-status'); return; }
    if (!name) { producerStatus(t('admin.wineNameMissing'), '', 'wf-image-status'); return; }
    btn.disabled = true;
    producerStatus(t('image.searching'), 'busy', 'wf-image-status');
    let images: { url: string; page: string }[] = [];
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/find-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ name, producer: field<HTMLInputElement>('wf-producer').value.trim(), vintage: field<HTMLInputElement>('wf-vintage').value.trim(), website }),
      });
      if (res.ok) images = ((await res.json()) as { images: typeof images }).images ?? [];
    } catch {}
    btn.disabled = false;
    if (!images.length) { producerStatus(t('image.noneFound'), '', 'wf-image-status'); return; }
    producerStatus(t('image.pick'), '', 'wf-image-status');
    showImageOptions(images);
  });

  /** Pictures to choose from under the image (from the producer's site, or the other pictures on the shop page) */
  function showImageOptions(images: { url: string; page?: string }[]) {
    const box = $('wf-image-options');
    // The choices stay after picking one (the chosen one is marked); each can be removed with ×
    const current = $<HTMLImageElement>('wf-preview').hidden ? null : $<HTMLImageElement>('wf-preview').src;
    box.replaceChildren(...images.map((im) => {
      const cell = mk('div', 'image-cell');
      const b = mk('button', 'image-option');
      b.type = 'button';
      if (im.page) b.title = im.page;
      b.setAttribute('aria-pressed', String(im.url === current));
      const img = mk('img');
      img.src = im.url;
      img.alt = '';
      img.loading = 'lazy';
      // A picture that does not load is left out
      img.addEventListener('error', () => cell.remove());
      b.append(img);
      b.addEventListener('click', () => {
        pendingImage = null;
        removeImage = false;
        linkImage = im.url;
        setPreview(im.url);
        box.querySelectorAll('.image-option').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        producerStatus(t('image.chosen'), 'ok', 'wf-image-status');
      });
      const remove = mk('button', 'image-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', t('image.removeChoice'));
      remove.addEventListener('click', () => { cell.remove(); if (!box.children.length) box.hidden = true; });
      cell.append(b, remove);
      return cell;
    }));
    box.hidden = false;
  }

  // Drop a picture on the image field (or on the picture shown)
  const imageBox = $('wf-image-box');
  imageBox.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); imageBox.classList.add('dragging'); } });
  imageBox.addEventListener('dragleave', (e) => { if (!imageBox.contains(e.relatedTarget as Node)) imageBox.classList.remove('dragging'); });
  imageBox.addEventListener('drop', (e) => {
    imageBox.classList.remove('dragging');
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    const input = field<HTMLInputElement>('wf-image');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    useImage(input, 'wf-label-status');
  });
  /** "Fetched from <site>" above the name, when the wine came from a link. */
  function showSource() {
    const box = $('wf-source');
    box.hidden = !sourceUrl;
    if (!sourceUrl) return;
    const a = $<HTMLAnchorElement>('wf-source-link');
    a.href = sourceUrl;
    a.title = sourceUrl;
    try {
      const u = new URL(sourceUrl);
      a.textContent = u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? decodeURIComponent(u.pathname) : '');
    } catch { a.textContent = sourceUrl; }
    $('wf-source-when').textContent = sourceFetchedAt ? `(${fetchedWhen(sourceFetchedAt)})` : '';
    // The link field is only needed for another link
    showLinkBox(false);
  }
  function showLinkBox(on: boolean) {
    $('wf-link-box').hidden = !on;
  }

  $('wf-read-label').addEventListener('click', () => readLabel());
  $('wf-nv').addEventListener('click', () => { field<HTMLInputElement>('wf-vintage').value = 'NV'; });
  $('wf-read-link').addEventListener('click', () => readLink());
  $('wf-source-refresh').addEventListener('click', () => readLink(true));
  $('wf-source-other').addEventListener('click', () => {
    showLinkBox(true);
    field<HTMLInputElement>('wf-link').focus();
  });
  field<HTMLInputElement>('wf-link').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); readLink(); }
  });

  $('wf-image-remove').addEventListener('click', () => {
    pendingImage = null;
    linkImage = null;
    removeImage = true;
    field<HTMLInputElement>('wf-image').value = '';
    setPreview(null);
    labelStatus('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // The year belongs in Vintage, not in the name ("Château Fombrauge 2020" → "Château Fombrauge")
    const name = withoutYear(field<HTMLInputElement>('wf-name').value.trim(), field<HTMLInputElement>('wf-vintage').value.trim()) ?? '';
    // Every field checked; the first error gets the focus
    if (!checks.checkWithin(form) || !name) {
      if (!name) checks.check('wf-name');
      const bad = form.querySelector<HTMLElement>('[aria-invalid]');
      bad?.focus();
      showMsg(t('wineCheck.fix'));
      return;
    }

    // Never the same wine twice: same name and vintage as another wine in the library
    const vintageNow = field<HTMLInputElement>('wf-vintage').value.trim();
    const twin = wines.find((w) => w.id !== editing?.id && normOrigin(w.name) === normOrigin(name) && (w.vintage ?? '') === vintageNow);
    if (twin) {
      fieldError(field<HTMLInputElement>('wf-name'), t('wineCheck.twin'));
      field<HTMLInputElement>('wf-name').focus();
      showMsg(t('wineCheck.fix'));
      return;
    }
    const save = $<HTMLButtonElement>('wf-save');
    save.disabled = true;
    save.textContent = t('common.saving');

    let image_url = editing?.image_url ?? null;
    if (linkImage) image_url = linkImage;
    if (removeImage) image_url = null;
    if (pendingImage) {
      const url = await uploadImage(pendingImage);
      if (!url) {
        save.disabled = false;
        save.textContent = t('common.save');
        showMsg(t('admin.imageFailed'));
        return;
      }
      image_url = url;
    }

    const row = {
      name,
      producer: toText(field<HTMLInputElement>('wf-producer').value),
      style: styleSelect.value || null,
      vintage: toText(field<HTMLInputElement>('wf-vintage').value),
      abv: parseAmount(field<HTMLInputElement>('wf-abv').value),
      retail_price_dkk: parseAmount(field<HTMLInputElement>('wf-retail').value),
      offer_price_dkk: parseAmount(field<HTMLInputElement>('wf-offer-price').value),
      offer_quantity: (() => {
        const n = Math.round(Number(field<HTMLInputElement>('wf-offer-qty').value.trim()));
        return n >= 1 && n <= 99 && field<HTMLInputElement>('wf-offer-price').value.trim() ? n : null;
      })(),
      description: toText(field<HTMLTextAreaElement>('wf-description').value),
      details: toText(field<HTMLTextAreaElement>('wf-details').value),
      grapes: toText(field<HTMLInputElement>('wf-grapes').value),
      food_pairing: toText(field<HTMLInputElement>('wf-food').value),
      serving: toText(field<HTMLInputElement>('wf-serving').value),
      appellation: toText(appInput.value),
      region: toText(regionInput.value),
      country: countrySelect.value || null,
      image_url,
      source_url: sourceUrl,
      source_fetched_at: sourceUrl ? sourceFetchedAt : null,
      producer_website: webUrl(field<HTMLInputElement>('wf-producer-website').value),
      producer_address: toText(field<HTMLInputElement>('wf-producer-address').value),
    };
    // A new producer or website: the place found earlier no longer applies and is looked up again
    const before = editing;
    const changed = !before || normOrigin(before.producer) !== normOrigin(row.producer)
      || (before.producer_website ?? null) !== row.producer_website;
    // …unless it was just found in the form for this producer and website
    const fresh = foundPlace && normOrigin(foundPlace.producer) === normOrigin(row.producer)
      && (!row.producer_website || row.producer_website === webUrl(foundPlace.website ?? '')) ? foundPlace : null;
    const place = fresh
      ? { producer_lat: fresh.lat, producer_lon: fresh.lat == null ? null : fresh.lon, producer_source: fresh.lat == null ? 'none' : fresh.source, producer_checked_at: new Date().toISOString() }
      : changed ? { producer_lat: null, producer_lon: null, producer_source: null, producer_checked_at: null } : {};

    const { data: saved, error } = before
      ? await supabase.from('wines').update({ ...row, ...place }).eq('id', before.id).select('id').single()
      : await supabase.from('wines').insert({ ...row, ...place, host_id: hostId }).select('id').single();

    save.disabled = false;
    save.textContent = t('common.save');
    if (error) { showMsg(t('admin.wineNotSaved')); return; }
    const newId = (saved as { id: number } | null)?.id;
    // An appellation that is not on our list: find its place for the overview map (in the background)
    locateAppellation(row.appellation, row.region, row.country);
    closeForm();
    await load();
    hooks.onSaved?.();
    // Say so, and show the wine in the list (it may be far down)
    const shownName = [name, row.vintage].filter(Boolean).join(' ');
    const li = newId ? list.querySelector<HTMLElement>(`li[data-id="${newId}"]`) : null;
    if (li) {
      li.scrollIntoView({ block: 'center', behavior: 'smooth' });
      li.classList.add('just-saved');
      setTimeout(() => li.classList.remove('just-saved'), 2600);
    }
    toast(t(before ? 'wineLib.savedToast' : 'wineLib.createdToast', { name: shownName }), {
      kind: 'ok',
      action: !before && newId && !li ? { label: t('wineLib.open'), href: paths().get(newId) ?? '/admin/wines/' } : undefined,
    });
    // The producer's website, address and place (in the background; the page updates when found)
    const id = (saved as { id: number } | null)?.id;
    if (id && row.producer && !fresh && (changed || !before?.producer_checked_at)) {
      locateProducer(id, { ...row, name }).then((found) => { if (found) { load(); hooks.onSaved?.(); } });
    }
  });

  type ProducerQuery = { name: string; producer: string | null; appellation: string | null; region: string | null; country: string | null; producer_website: string | null; producer_address?: string | null };
  /** The producer's website and place: from another wine by the same producer, else /api/find-producer. */
  async function lookupProducer(w: ProducerQuery, skipId?: number): Promise<Found | null> {
    const same = !w.producer ? null : wines.find((x) => x.id !== skipId && x.producer_checked_at && normOrigin(x.producer) === normOrigin(w.producer)
      && (!w.producer_website || x.producer_website === w.producer_website));
    if (same) return { website: same.producer_website ?? null, address: same.producer_address ?? null, lat: same.producer_lat ?? null, lon: same.producer_lon ?? null, source: same.producer_source ?? null };
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/find-producer', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ producer: w.producer, wine: w.name, appellation: w.appellation, region: w.region, country: w.country, website: w.producer_website }),
      });
      if (!res.ok) return null;
      const r = (await res.json()) as { website: string | null; address: string | null; location: { lat: number; lon: number; source: string } | null };
      return { website: r.website, address: r.address, lat: r.location?.lat ?? null, lon: r.location?.lon ?? null, source: r.location?.source ?? null };
    } catch { return null; }
  }

  function producerStatus(text: string, kind: 'busy' | 'ok' | '' = '', id = 'wf-producer-status') {
    const el = $(id);
    el.textContent = text;
    el.className = 'producer-status' + (kind ? ' ' + kind : '');
    el.hidden = !text;
  }

  /** As soon as the producer is known in the form: find the website and address and fill in the empty fields. */
  async function fillProducer() {
    const producer = field<HTMLInputElement>('wf-producer').value.trim();
    const websiteEl = field<HTMLInputElement>('wf-producer-website');
    const addressEl = field<HTMLInputElement>('wf-producer-address');
    if (!producer || (websiteEl.value.trim() && addressEl.value.trim())) return;
    if (foundPlace && normOrigin(foundPlace.producer) === normOrigin(producer)) return;
    const turn = ++producerTurn;
    // A spinner under each field that is still empty – and under the producer, where the search starts
    const wantSite = !websiteEl.value.trim(), wantAddress = !addressEl.value.trim();
    producerStatus(t('producer.searchingBoth'), 'busy', 'wf-producer-busy');
    producerStatus(wantSite ? t('producer.searching') : '', wantSite ? 'busy' : '');
    producerStatus(wantAddress ? t('producer.searchingAddress') : '', wantAddress ? 'busy' : '', 'wf-address-status');
    const found = await lookupProducer({
      name: field<HTMLInputElement>('wf-name').value.trim(), producer,
      appellation: toText(appInput.value), region: toText(regionInput.value), country: countrySelect.value || null,
      producer_website: webUrl(websiteEl.value),
    }, editing?.id);
    if (turn !== producerTurn || !form.isConnected) return; // the form was closed or the producer changed meanwhile
    const clear = () => { producerStatus(''); producerStatus('', '', 'wf-address-status'); producerStatus('', '', 'wf-producer-busy'); };
    if (normOrigin(field<HTMLInputElement>('wf-producer').value) !== normOrigin(producer)) { clear(); return; }
    if (found) foundPlace = { ...found, producer };
    // Under the producer: what was found, and where it is (further down); nothing when nothing was found
    const got = (wantSite && found?.website) || (wantAddress && found?.address);
    producerStatus(got ? t('producer.foundStep3') : '', got ? 'ok' : '', 'wf-producer-busy');
    // The website
    if (wantSite) {
      if (found?.website && !websiteEl.value.trim()) {
        websiteEl.value = found.website;
        websiteEl.classList.add('from-label');
        producerStatus(t(found.lat != null ? 'producer.foundPlace' : 'producer.found'), 'ok');
      } else producerStatus(websiteEl.value.trim() ? '' : t('producer.notFound'));
    }
    // The address
    if (wantAddress) {
      if (found?.address && !addressEl.value.trim()) {
        addressEl.value = found.address;
        addressEl.classList.add('from-label');
        producerStatus(t('producer.addressFound'), 'ok', 'wf-address-status');
      } else producerStatus(addressEl.value.trim() ? '' : t('producer.addressNotFound'), '', 'wf-address-status');
    }
    if (found?.address && found.lat == null && addressEl.value.trim() === found.address) {
      producerStatus(t('producer.addressFound') + ' ' + t('producer.notPrecise'), '', 'wf-address-status');
    }
    showOriginMap();
  }
  field<HTMLInputElement>('wf-producer').addEventListener('change', () => fillProducer());

  // The producer's website typed by hand: the old message goes as soon as it changes; when it is left, it is
  // checked, written as https://…, and – if the address is still empty – used to find the address
  const siteEl = field<HTMLInputElement>('wf-producer-website');
  siteEl.addEventListener('input', () => { producerStatus(''); fieldError(siteEl, null); });
  siteEl.addEventListener('change', async () => {
    const typed = siteEl.value.trim();
    if (!typed) return;
    const url = webUrl(typed);
    if (!url) { fieldError(siteEl, t('producer.websiteBad')); return; }
    siteEl.value = url;
    siteEl.classList.remove('from-label');
    const addressEl = field<HTMLInputElement>('wf-producer-address');
    const producer = field<HTMLInputElement>('wf-producer').value.trim();
    if (addressEl.value.trim()) { producerStatus('✓ ' + t('producer.websiteSet'), 'ok'); return; }
    // Look for the address from this website
    const turn = ++producerTurn;
    producerStatus(t('producer.websiteSet'), 'ok');
    producerStatus(t('producer.searchingAddress'), 'busy', 'wf-address-status');
    const found = await lookupProducer({ name: field<HTMLInputElement>('wf-name').value.trim(), producer,
      appellation: toText(appInput.value), region: toText(regionInput.value), country: countrySelect.value || null,
      producer_website: url }, editing?.id);
    if (turn !== producerTurn || siteEl.value !== url) return;
    producerStatus('✓ ' + t('producer.websiteSet'), 'ok');
    if (found) foundPlace = { ...found, website: url, producer };
    if (found?.address && !addressEl.value.trim()) {
      addressEl.value = found.address;
      addressEl.classList.add('from-label');
      producerStatus(t('producer.addressFound') + (found.lat == null ? ' ' + t('producer.notPrecise') : ''), found.lat != null ? 'ok' : '', 'wf-address-status');
    } else producerStatus(t('producer.addressNotFound'), '', 'wf-address-status');
    showOriginMap();
  });

  /** Wines in the library with a name like the one typed – to open instead of making a second copy. */
  function showSimilar() {
    const box = $('wf-similar');
    const typed = normOrigin(field<HTMLInputElement>('wf-name').value);
    const words = typed.split(' ').filter((x) => x.length > 2);
    if (typed.length < 3 || !words.length) { box.hidden = true; return; }
    const vintage = field<HTMLInputElement>('wf-vintage').value.trim();
    const hits = wines
      .filter((w) => w.id !== editing?.id)
      .map((w) => {
        const n = normOrigin(w.name);
        const score = n === typed ? 3 : n.includes(typed) || typed.includes(n) ? 2 : words.every((x) => n.includes(x)) ? 1 : 0;
        return { w, score: score + (score && vintage && w.vintage === vintage ? 1 : 0) };
      })
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    if (!hits.length) { box.hidden = true; return; }
    const same = hits[0].score >= 3;
    const head = document.createElement('p');
    head.textContent = t(same ? 'wineCheck.sameName' : 'wineCheck.similar');
    const ul = document.createElement('ul');
    for (const { w } of hits) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = paths().get(w.id) ?? '/admin/wines/';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = [w.name, w.vintage, w.producer].filter(Boolean).join(' · ') + ' ↗';
      li.append(a);
      ul.append(li);
    }
    box.replaceChildren(head, ul);
    box.classList.toggle('same', same);
    box.hidden = false;
  }
  field<HTMLInputElement>('wf-name').addEventListener('input', showSimilar);
  field<HTMLInputElement>('wf-vintage').addEventListener('change', showSimilar);

  /** A typed or corrected address: find its exact place (no pin unless the address is placed precisely). */
  let geoTurn = 0;
  async function placeAddress() {
    const addressEl = field<HTMLInputElement>('wf-producer-address');
    const address = addressEl.value.trim();
    const producer = field<HTMLInputElement>('wf-producer').value.trim();
    const turn = ++geoTurn;
    if (!address) { producerStatus('', '', 'wf-address-status'); return; }
    producerStatus(t('producer.placing'), 'busy', 'wf-address-status');
    let hit = null as GeoHit | null;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ address, country: countrySelect.value || null }),
      });
      if (res.ok) hit = ((await res.json()) as { location: GeoHit | null }).location;
    } catch {}
    if (turn !== geoTurn || addressEl.value.trim() !== address) return;
    foundPlace = { website: webUrl(field<HTMLInputElement>('wf-producer-website').value), address, producer,
      lat: hit?.lat ?? null, lon: hit?.lon ?? null, source: hit?.source ?? null };
    producerStatus(t(hit ? 'producer.placed' : 'producer.notPrecise'), hit ? 'ok' : '', 'wf-address-status');
    showOriginMap();
  }
  field<HTMLInputElement>('wf-producer-address').addEventListener('change', () => placeAddress());

  /** Finds and saves the producer's website and place for a saved wine (in the background). */
  async function locateProducer(id: number, w: ProducerQuery) {
    const found = await lookupProducer(w, id);
    if (!found) return false;
    // What the host typed stays; the lookup fills the rest
    const { error } = await supabase.from('wines').update({
      producer_website: w.producer_website ?? webUrl(found.website ?? ''),
      producer_address: w.producer_address ?? found.address,
      producer_lat: found.lat, producer_lon: found.lat == null ? null : found.lon,
      producer_source: found.lat == null ? 'none' : found.source,
      producer_checked_at: new Date().toISOString(),
    }).eq('id', id);
    return !error;
  }

  // Delete: a clear question in the panel's foot, then the wine leaves the list with "Undo" for a while
  $('wf-delete').addEventListener('click', () => {
    if (!editing) return;
    const n = tastingsOf(editing).length;
    $('wf-delete-q').textContent = t(n ? 'wineLib.deleteQIn' : 'wineLib.deleteQ', { name: editing.name, n });
    $('wf-delete-confirm').hidden = false;
    $('wf-actions').hidden = true;
    $('wf-delete-no').focus();
  });
  $('wf-delete-no').addEventListener('click', () => { $('wf-delete-confirm').hidden = true; $('wf-actions').hidden = false; });
  $('wf-delete-yes').addEventListener('click', () => {
    if (!editing) return;
    const id = editing.id;
    closeForm();
    // On a wine's own page: back to the list, which deletes it (with Undo)
    if (hooks.onDeleted) { hooks.onDeleted(id); return; }
    deleteLater(id);
  });

  /** Hides a wine and deletes it when the toast goes – unless "Undo" is pressed. */
  async function deleteLater(id: number) {
    const w = wines.find((x) => x.id === id);
    if (!w) return;
    const { data } = await supabase.auth.getSession();
    pendingDelete.set(id, data.session?.access_token ?? '');
    render();
    toast(t('wineLib.deletedToast', { name: [w.name, w.vintage].filter(Boolean).join(' ') }), {
      ms: 8000,
      action: { label: t('wineLib.undo'), run: () => { pendingDelete.delete(id); render(); toast(t('wineLib.restoredToast'), { kind: 'ok' }); } },
      onTimeout: () => deleteNow(id),
    });
  }
  async function deleteNow(id: number) {
    if (!pendingDelete.has(id)) return;
    const { error } = await supabase.from('wines').delete().eq('id', id);
    pendingDelete.delete(id);
    if (error) { render(); toast(t('admin.wineOrdered'), { kind: 'error', ms: 9000 }); return; }
    await load();
  }
  // Leaving the page before the toast is gone: delete now (keepalive, so it is sent after the page closes)
  addEventListener('pagehide', () => {
    for (const [id, token] of pendingDelete) {
      fetch(`${SUPABASE_URL}/rest/v1/wines?id=eq.${id}`, { method: 'DELETE', keepalive: true,
        headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token || SUPABASE_KEY}` } });
    }
    pendingDelete.clear();
  });

  /** Opens the panel for a wine on the list; with refresh it fetches its link again straight away. */
  function edit(id: number, refresh = false) {
    const w = wines.find((x) => x.id === id);
    if (!w) return;
    openForm(w);
    if (refresh && w.source_url) readLink(true);
  }

  /** Every wine's own address (see admin-wine-page.ts). */
  function paths() { return winePaths(wines); }

  /** Scrolls to a wine in the list and lights it up for a moment; false when it is not shown (filters). */
  function highlight(id: number) {
    const li = list.querySelector<HTMLElement>(`li[data-id="${id}"]`);
    if (!li) return false;
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    li.classList.remove('just-saved');
    void li.offsetWidth;
    li.classList.add('just-saved');
    setTimeout(() => li.classList.remove('just-saved'), 2600);
    return true;
  }

  return { load, edit, paths, deleteLater, highlight, wines: () => wines.filter((w) => !pendingDelete.has(w.id)) };
}
