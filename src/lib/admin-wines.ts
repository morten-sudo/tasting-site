// Admin, wine library: the host's wines across all tastings – add, edit and delete one at a time,
// filled in from a label photo or a shop link. Prices and visibility per tasting live on the tasting page.
import { knownProducer, shareProducer } from './producers';
import { formatKr } from './ui/kr';
import { setLoading } from './ui/button';
import { getDropdown, type DropdownEl } from './ui/dropdown';
import { imagePicker } from './ui/image-picker';
import { supabase } from './supabase';
import { $ } from './ui/dom';
import { STYLES, styleName } from './wines';
import { t, lang, locale } from '../i18n';
import { wineMap, showMapCredit } from './wine-map';
import { withoutYear } from './wines';
import { winePaths } from './admin-wine-page';
import { iconButton, closeButton, sheetPanel } from './admin-common';
import { wineChecks, parseAmount, amountText } from './wine-validate';
import { toast } from './ui/toast';
import { tooltip } from './ui/tooltip';
import { confirmModal } from './ui/confirm';
import { setStatus, type StatusState } from './ui/status-line';
import { fieldError, focusField } from './field-error';
import { combo, type ComboOption } from './combo';
import { filterDropdown, type DdOption } from './filter-dd';
import { listRow } from './ui/list-row';
import { wineThumb } from './ui/thumb';
import { highlight as highlightRow } from './ui/highlight';
import { deleteWithUndo } from './ui/delete-undo';
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
  tasting_wines?: { price_dkk?: number | null; price_tiers?: { qty: number; price: number }[] | null; tastings: { slug: string; title: string } | null }[];
};

const COLUMNS = 'id, host_id, name, producer, style, vintage, abv, country, region, appellation, appellation_id, retail_price_dkk, offer_price_dkk, offer_quantity, description, details, image_url, source_url, source_fetched_at, grapes, food_pairing, serving, producer_website, producer_address, producer_lat, producer_lon, producer_source, producer_checked_at, tasting_wines(price_dkk, price_tiers, tastings(slug, title))';
const BUCKET = 'wine-images';

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
  const pendingDelete = new Set<number>();
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
  // Editing a wine: the side panel (new wines come in through the line above the list, wine-quick-add.ts).
  // Closing with changes asks "Discard changes?" first – also a new picture counts.
  const sheet = sheetPanel(panel, {
    onClose: () => { editing = null; },
    dirty: () => !!editing && (sheet.changed() || !!pendingImage || !!linkImage || removeImage),
  });
  const list = $<HTMLUListElement>('wine-admin-list');
  const checks = wineChecks(form);
  const AMOUNTS = ['wf-abv', 'wf-retail', 'wf-offer-price'];
  const field = <E extends HTMLInputElement | HTMLTextAreaElement>(id: string) => $<E>(id);

  // The picture: the one image picker (choose, drop or paste)
  const picker = imagePicker({
    onFile: (f) => useImage(f, 'wf-label-status'),
    onRemove: () => { pendingImage = null; linkImage = null; removeImage = true; setPreview(null); labelStatus(''); },
  });
  $('wf-pick').replaceWith(picker.el);

  // Style options
  // The one dropdown (src/lib/ui/dropdown.ts); the box works like a <select> (.value, "change")
  const styleSelect = getDropdown('wf-style', { placeholder: t('admin.choose'), notSet: true, options: STYLES.map((key) => ({ value: key, label: styleName(key) })) }).el;

  // ---------- Origin: country → region → appellation ----------
  // Each choice narrows the next list; a known appellation fills in region and country.
  // A long list: the dropdown gets a search field
  const countrySelect = getDropdown('wf-country', { placeholder: t('admin.choose'), search: true, notSet: true,
    options: WINE_COUNTRIES.map((c) => ({ value: c, label: countryName(c) ?? c })).sort((a, b) => a.label.localeCompare(b.label, lang())) }).el;
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
    setStatus($('wf-app-status'), !text || !appellations.length ? null : known ? 'ok' : 'info', known
      ? t('origin.known', { name: known.name, where: [known.subregion, known.region, countryName(known.country)].filter(Boolean).join(', ') })
      : t('origin.unknown'));
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
      showMapCredit($('wf-map-svg'), m);
    }, 250);
  }
  appInput.addEventListener('input', syncOrigin);
  appInput.addEventListener('change', syncOrigin);
  // The region is checked when it is chosen or left, not on every letter
  regionInput.addEventListener('input', () => { fillLists(); showOriginMap(); });
  regionInput.addEventListener('change', regionChanged);
  countrySelect.addEventListener('change', countryChanged);

  // ---------- Read the label (Cloudflare Workers AI via /api/read-label) ----------
  // Status line under the link field or under the photo, with a spinner while working
  type StatusId = 'wf-label-status' | 'wf-link-status' | 'wf-source-status';
  let statusTarget: StatusId = 'wf-label-status';
  function labelStatus(text: string, kind: StatusState | null = null) {
    for (const id of ['wf-label-status', 'wf-link-status', 'wf-source-status']) setStatus($(id), id === statusTarget ? kind : null, text);
    form.classList.toggle('reading', kind === 'busy');
  }
  const busyButton = (btn: HTMLButtonElement, on: boolean) => setLoading(btn, on);

  async function readLabel(target: StatusId = 'wf-label-status') {
    if (!pendingImage) return;
    const btn = $<HTMLButtonElement>('wf-read-label');
    statusTarget = target;
    busyButton(btn, true);
    picker.setBusy(true);
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
      picker.setBusy(false);
    }
  }

  // ---------- Filling the form from a label or a link ----------
  // Empty fields are filled straight away; fields that already hold something else are offered
  // as a list the host can accept with one click, so nothing is overwritten by accident.
  type Change = { id: string; apply: () => void };
  /** The field's label without its hint, e.g. "Vintage". */
  const fieldName = (id: string) => {
    if (id === 'wf-image') return t('admin.image');
    const label = form.querySelector<HTMLElement>(`label[for="${id}"], label[for="${id}-btn"]`);
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
    const set = (el: HTMLInputElement | HTMLTextAreaElement | DropdownEl, v: string) => {
      el.value = v;
      el.classList.add('from-label');
      if (el.id === 'wf-name' || el.id === 'wf-vintage') queueMicrotask(showSimilar);
    };
    const put = (id: string, value: string | number | null | undefined) => {
      if (value == null || value === '') return;
      const el = field<HTMLInputElement | HTMLTextAreaElement>(id) as HTMLInputElement | HTMLTextAreaElement | DropdownEl;
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
    const names = [...new Set(f.changes.map((c) => fieldName(c.id)))];
    const differs = t('fill.differs', { n: names.length, fields: names.join(', ') });
    labelStatus(text.trim() || differs, n ? 'ok' : f.changes.length ? 'warn' : 'error');
    if (!f.changes.length) return;
    const el = $(statusTarget);
    const line = mk('span', 'fill-diff', differs);
    const btn = mk('button', 'btn small secondary fill-use', t('fill.useNew'));
    btn.type = 'button';
    btn.addEventListener('click', () => {
      f.changes.forEach((c) => c.apply());
      syncOrigin();
      labelStatus(t('fill.applied', { n: names.length }), 'ok');
    });
    // Under the line: what differs (when something was also filled) and the button that takes the new values
    el.append(...(text.trim() ? [line] : []), btn);
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
        if (!previewUrl) { useImage(); f.bump(); }
        else if (previewUrl !== r.image) f.add({ id: 'wf-image', apply: useImage });
      }
      // The page's other pictures: our guess may be the back label or a detail – the host can pick another
      const others = (r.images ?? []).filter((u) => u !== r.image);
      if (others.length && !pendingImage) {
        showImageOptions([r.image, ...others].filter((u): u is string => !!u).map((url) => ({ url })));
        producerStatus(t('image.fromSource'), 'ok', 'wf-image-status');
      }
      sourceUrl = r.source_url;
      sourceFetchedAt = new Date().toISOString();
      showSource();
      statusTarget = 'wf-source-status';
      const offer = r.offer
        ? ' ' + t(r.offer.quantity > 1 ? 'link.offerMany' : 'link.offerOne', { price: formatKr(r.offer.price), n: r.offer.quantity })
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

  let previewUrl: string | null = null;
  function setPreview(url: string | null, name = '') {
    previewUrl = url;
    picker.setImage(url, name);
    $('wf-read-label').hidden = !pendingImage;
  }

  function openForm(w: AdminWine) {
    editing = w;
    checks.clear();
    $('wf-similar').hidden = true;
    setStatus($('wf-producer-busy'), null);
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
    renderInTastings(w);
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
    sheet.open();
    // On phones the keyboard would cover the sheet, so only focus a field on larger screens
    if (matchMedia('(min-width: 48rem)').matches) field<HTMLInputElement>('wf-name').focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur();
  }

  /** The guest price in each tasting the wine is in – read here, changed in the tasting (the link opens its panel). */
  function renderInTastings(w: AdminWine) {
    const box = document.getElementById('wf-in-tastings');
    const list = document.getElementById('wf-in-tastings-list');
    if (!box || !list) return;
    const rows = (w.tasting_wines ?? []).filter((x) => x.tastings);
    box.hidden = !rows.length;
    list.replaceChildren(...rows.map((x) => {
      const li = mk('li');
      const name = mk('span', 'wf-it-name', x.tastings!.title);
      const tiers = (x.price_tiers ?? []).map((y) => t('twe.tierLine', { n: y.qty, price: formatKr(Number(y.price)) }));
      const price = mk('span', 'wf-it-price', [x.price_dkk != null ? formatKr(Number(x.price_dkk)) : t('twe.noPrice'), ...tiers].join(' · '));
      const go = mk('a', 'text-btn', t('wineLib.changeInTasting'));
      go.href = `/t/${x.tastings!.slug}/admin/wines/?edit=${w.id}`;
      li.append(name, price, go);
      return li;
    }));
  }

  /** Closes after saving or deleting (nothing to ask) */
  function closeForm() {
    editing = null;
    sheet.close();
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
    country: filterDropdown({ name: t('wineLib.country'), allLabel: t('wineLib.allCountries'), allShort: t('wineLib.countriesShort'), onChange: (v) => setFilter('country', v) }),
    region: filterDropdown({ name: t('wineLib.region'), allLabel: t('wineLib.allRegions'), allShort: t('wineLib.regionsShort'), onChange: (v) => setFilter('region', v) }),
    style: filterDropdown({ name: t('wineLib.type'), allLabel: t('wineLib.allStyles'), allShort: t('wineLib.stylesShort'), onChange: (v) => setFilter('style', v) }),
    tasting: filterDropdown({ name: t('wineLib.tasting'), allLabel: t('wineLib.allTastings'), allShort: t('wineLib.tastingsShort'), onChange: (v) => setFilter('tasting', v) }),
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
    // A wine can be in several tastings: count the wines, not the tastings
    dds.tasting.render(tOpts, filter.tasting, tRows.length, { shown: tRows.filter((w) => matches(w)).length });
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
  // Nothing matches: one button clears the filters and the search
  document.getElementById('wine-no-match-clear')?.addEventListener('click', () => {
    for (const k of FKEYS) filter[k] = new Set();
    filter.q = '';
    const q = document.getElementById('wine-search') as HTMLInputElement | null;
    if (q) { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); }
    saveFilter();
    render();
  });

  function render() {
    list.replaceChildren();
    $('wine-empty').hidden = wines.length > 0;
    list.hidden = !wines.length;
    const shown = wines.filter((w) => !pendingDelete.has(w.id) && matches(w));
    renderFilters(shown.length);
    const noMatch = document.getElementById('wine-no-match');
    if (noMatch) noMatch.hidden = !wines.length || shown.length > 0;
    // One row per wine (the one list row): picture, name (its own page), what it is, origin, the shop's prices,
    // the tastings it is in as chips – and the pencil
    list.replaceChildren(...shown.map((w) => {
      const offer = w.offer_price_dkk != null ? t((w.offer_quantity ?? 1) > 1 ? 'link.offerMany' : 'link.offerOne',
        { price: formatKr(w.offer_price_dkk), n: w.offer_quantity ?? 1 }) : null;
      // Which tastings the wine is in, with the wine's guest price there (separate from the shop's price)
      const ts = tastingsOf(w);
      const chips = ts.map((tt) => {
        const p = (w.tasting_wines ?? []).find((x) => x.tastings?.slug === tt.slug)?.price_dkk;
        return { text: p != null ? `${tt.title} · ${formatKr(Number(p))}` : tt.title, href: `/t/${tt.slug}/admin/` };
      });
      const edit = iconButton('edit', `${t('admin.edit')}: ${w.name}`);
      edit.dataset.tip = t('admin.edit');
      edit.addEventListener('click', () => openForm(w));
      return listRow({
        id: w.id, pic: wineThumb(w), title: w.name, href: paths().get(w.id) ?? '/admin/wines/',
        meta: [[w.style ? styleName(w.style) : null, w.vintage, w.producer], originLine(w),
          [w.retail_price_dkk != null ? t('admin.normally', { price: formatKr(w.retail_price_dkk) }) : null, offer]],
        chips: chips.length ? chips : [{ text: t('wineLib.unused'), dashed: true }],
        actions: [edit],
      });
    }));
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

  async function useImage(file: File, status: StatusId) {
    pendingImage = await shrinkImage(file);
    removeImage = false;
    setPreview(URL.createObjectURL(pendingImage), file.name);
    // A new wine: read the label straight away
    if (!editing) readLabel(status);
  }
  // An official picture from the producer's website (find-image): the best candidates, the host picks one
  $('wf-find-image').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('wf-find-image');
    const box = $('wf-image-options');
    const website = webUrl(field<HTMLInputElement>('wf-producer-website').value);
    const name = field<HTMLInputElement>('wf-name').value.trim();
    box.hidden = true;
    if (!website) { producerStatus(t('image.needWebsite'), 'warn', 'wf-image-status'); return; }
    if (!name) { producerStatus(t('admin.wineNameMissing'), 'warn', 'wf-image-status'); return; }
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
    if (!images.length) { producerStatus(t('image.noneFound'), 'warn', 'wf-image-status'); return; }
    producerStatus(t('image.pick'), 'info', 'wf-image-status');
    showImageOptions(images);
  });

  /** Pictures to choose from under the image (from the producer's site, or the other pictures on the shop page) */
  function showImageOptions(images: { url: string; page?: string }[]) {
    const box = $('wf-image-options');
    // The choices stay after picking one (the chosen one is marked); each can be removed with ×
    const current = previewUrl;
    box.replaceChildren(...images.map((im) => {
      const cell = mk('div', 'image-cell');
      const b = mk('button', 'image-option');
      b.type = 'button';
      if (im.page) tooltip(b, im.page);
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
      const remove = closeButton(t('image.removeChoice'), 'small');
      remove.addEventListener('click', () => { cell.remove(); if (!box.children.length) box.hidden = true; });
      cell.append(b, remove);
      return cell;
    }));
    box.hidden = false;
  }

  /** "Fetched from <site>" above the name, when the wine came from a link. */
  function showSource() {
    const box = $('wf-source');
    box.hidden = !sourceUrl;
    if (!sourceUrl) return;
    const a = $<HTMLAnchorElement>('wf-source-link');
    a.href = sourceUrl;
    tooltip(a, sourceUrl);
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



  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // The year belongs in Vintage, not in the name ("Château Fombrauge 2020" → "Château Fombrauge")
    const name = withoutYear(field<HTMLInputElement>('wf-name').value.trim(), field<HTMLInputElement>('wf-vintage').value.trim()) ?? '';
    // Every field checked; the first error gets the focus
    if (!checks.checkWithin(form) || !name) {
      if (!name) checks.check('wf-name');
      const bad = form.querySelector<HTMLElement>('[aria-invalid]');
      if (bad) focusField(bad);
      return;
    }

    // Never the same wine twice: same name and vintage as another wine in the library
    const vintageNow = field<HTMLInputElement>('wf-vintage').value.trim();
    const twin = wines.find((w) => w.id !== editing?.id && normOrigin(w.name) === normOrigin(name) && (w.vintage ?? '') === vintageNow);
    if (twin) {
      fieldError(field<HTMLInputElement>('wf-name'), t('wineCheck.twin'));
      focusField(field<HTMLInputElement>('wf-name'));
      return;
    }
    const save = $<HTMLButtonElement>('wf-save');
    setLoading(save, true, t('common.saving'));

    let image_url = editing?.image_url ?? null;
    if (linkImage) image_url = linkImage;
    if (removeImage) image_url = null;
    if (pendingImage) {
      const url = await uploadImage(pendingImage);
      if (!url) {
        setLoading(save, false);
        toast(t('admin.imageFailed'), { kind: 'error' });
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

    setLoading(save, false);
    if (error) { toast(t('admin.wineNotSaved'), { kind: 'error' }); return; }
    const newId = (saved as { id: number } | null)?.id;
    // The producer's facts belong to every wine by the producer: the account's other wines get the ones they miss
    await shareProducer(row.producer, { website: row.producer_website, address: row.producer_address,
      ...(fresh && fresh.lat != null ? { lat: fresh.lat, lon: fresh.lon, source: fresh.source } : {}) }, newId);
    // A wine that came into a tasting before it had a price gets the price there now (an offer on 1 bottle first)
    const start = row.offer_quantity === 1 && row.offer_price_dkk != null ? row.offer_price_dkk : row.retail_price_dkk;
    if (before && start != null) await supabase.from('tasting_wines').update({ price_dkk: start }).eq('wine_id', before.id).is('price_dkk', null);
    // An appellation that is not on our list: find its place for the overview map (in the background)
    locateAppellation(row.appellation, row.region, row.country);
    closeForm();
    await load();
    hooks.onSaved?.();
    // Say so, and show the wine in the list (it may be far down)
    const shownName = [name, row.vintage].filter(Boolean).join(' ');
    const li = newId ? list.querySelector<HTMLElement>(`li[data-id="${newId}"]`) : null;
    highlightRow(li, { scroll: 'center' });
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
    // …or what another host has already found for the producer (unless the host typed another website)
    const known = await knownProducer(w.producer);
    if (known && (!w.producer_website || !known.website || webUrl(known.website) === w.producer_website)
      && (known.website || known.lat != null)) return known;
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

  function producerStatus(text: string, kind: StatusState | '' = '', id = 'wf-producer-status') {
    setStatus($(id), text ? kind || 'info' : null, text);
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
      } else producerStatus(websiteEl.value.trim() ? '' : t('producer.notFound'), 'warn');
    }
    // The address
    if (wantAddress) {
      if (found?.address && !addressEl.value.trim()) {
        addressEl.value = found.address;
        addressEl.classList.add('from-label');
        producerStatus(t('producer.addressFound'), 'ok', 'wf-address-status');
      } else producerStatus(addressEl.value.trim() ? '' : t('producer.addressNotFound'), 'warn', 'wf-address-status');
    }
    if (found?.address && found.lat == null && addressEl.value.trim() === found.address) {
      producerStatus(t('producer.addressFound') + ' ' + t('producer.notPrecise'), 'warn', 'wf-address-status');
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
    if (addressEl.value.trim()) { producerStatus(t('producer.websiteSet'), 'ok'); return; }
    // Look for the address from this website
    const turn = ++producerTurn;
    producerStatus(t('producer.websiteSet'), 'ok');
    producerStatus(t('producer.searchingAddress'), 'busy', 'wf-address-status');
    const found = await lookupProducer({ name: field<HTMLInputElement>('wf-name').value.trim(), producer,
      appellation: toText(appInput.value), region: toText(regionInput.value), country: countrySelect.value || null,
      producer_website: url }, editing?.id);
    if (turn !== producerTurn || siteEl.value !== url) return;
    producerStatus(t('producer.websiteSet'), 'ok');
    if (found) foundPlace = { ...found, website: url, producer };
    if (found?.address && !addressEl.value.trim()) {
      addressEl.value = found.address;
      addressEl.classList.add('from-label');
      producerStatus(t('producer.addressFound') + (found.lat == null ? ' ' + t('producer.notPrecise') : ''), found.lat != null ? 'ok' : 'warn', 'wf-address-status');
    } else producerStatus(t('producer.addressNotFound'), 'warn', 'wf-address-status');
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
    producerStatus(t(hit ? 'producer.placed' : 'producer.notPrecise'), hit ? 'ok' : 'warn', 'wf-address-status');
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
    if (!error) await shareProducer(w.producer, { website: w.producer_website ?? webUrl(found.website ?? ''), address: w.producer_address ?? found.address,
      lat: found.lat, lon: found.lon, source: found.source }, id);
    return !error;
  }

  // Delete: asked about first (the one confirmation), then the wine leaves the list with "Undo" for a while
  const deleteQuestion = (w: AdminWine) => {
    const n = tastingsOf(w).length;
    return { title: t('wineLib.deleteQ', { name: w.name }), ok: t('admin.deleteWine'), text: n ? t('wineLib.deleteTextIn', { n }) : t('wineLib.deleteText') };
  };
  $('wf-delete').addEventListener('click', async () => {
    if (!editing) return;
    const w = editing;
    // On a wine's own page: asked here, then back to the list, which deletes it (with Undo)
    if (hooks.onDeleted) {
      if (await confirmModal({ ...deleteQuestion(w), danger: true })) { closeForm(); hooks.onDeleted(w.id); }
      return;
    }
    deleteLater(w.id, true);
  });

  /** Hides a wine and deletes it when the toast goes – unless "Undo" is pressed (the one delete with Undo). */
  function deleteLater(id: number, ask = false) {
    const w = wines.find((x) => x.id === id);
    if (!w) return Promise.resolve(false);
    return deleteWithUndo({
      label: t('wineLib.deletedToast', { name: [w.name, w.vintage].filter(Boolean).join(' ') }),
      ask: ask ? deleteQuestion(w) : null,
      hide: () => { if (editing) closeForm(); pendingDelete.add(id); render(); },
      restore: () => { pendingDelete.delete(id); render(); highlight(id); },
      restored: t('wineLib.restoredToast'),
      commit: async () => {
        const { error } = await supabase.from('wines').delete().eq('id', id);
        if (error) return false;
        pendingDelete.delete(id);
        await load();
        return true;
      },
      keepalive: [`wines?id=eq.${id}`],
      failed: t('admin.wineOrdered'),
    });
  }

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
    return highlightRow(list.querySelector(`li[data-id="${id}"]`));
  }

  return { load, edit, paths, deleteLater, highlight, wines: () => wines.filter((w) => !pendingDelete.has(w.id)) };
}
