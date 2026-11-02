// Admin, wine library: the host's wines across all tastings – add, edit and delete one at a time,
// filled in from a label photo or a shop link. Prices and visibility per tasting live on the tasting page.
import { supabase } from './supabase';
import { STYLES, styleName, kr } from './wines';
import { t, lang, locale } from '../i18n';
import { wineMap } from './wine-map';
import { withoutYear } from './wines';
import { winePaths } from './admin-wine-page';
import { forgetGuesses } from './overview-map';
import { WINE_COUNTRIES, countryName, loadAppellations, loadRegions, matchAppellation, matchRegion, normOrigin, originLine, type Appellation, type WineRegion } from './origin';

export type AdminWine = {
  id: number; host_id: string; name: string; producer: string | null;
  style: string | null; vintage: string | null; abv: number | null;
  retail_price_dkk: number | null; description: string | null; details: string | null;
  image_url: string | null; source_url: string | null;
  country: string | null; region: string | null; appellation: string | null; appellation_id: string | null;
  offer_price_dkk: number | null; offer_quantity: number | null;
  producer_website?: string | null; producer_address?: string | null;
  producer_lat?: number | null; producer_lon?: number | null; producer_source?: string | null; producer_checked_at?: string | null;
  tasting_wines?: { tastings: { slug: string; title: string } | null }[];
};

const COLUMNS = 'id, host_id, name, producer, style, vintage, abv, country, region, appellation, appellation_id, retail_price_dkk, offer_price_dkk, offer_quantity, description, details, image_url, source_url, producer_website, producer_address, producer_lat, producer_lon, producer_source, producer_checked_at, tasting_wines(tastings(slug, title))';
const BUCKET = 'wine-images';
const MAX_IMAGE_SIDE = 1400;

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

/** Shrinks a photo to at most MAX_IMAGE_SIDE px and re-encodes it as JPEG. */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
}

/** A smaller JPEG data URI for reading the label (keeps the request light). */
async function labelDataUrl(blob: Blob, maxSide = 1024): Promise<string | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return null;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

type LabelResult = {
  name: string | null; producer: string | null; vintage: string | null; style: string | null;
  abv: number | null; appellation: string | null; region: string | null; country: string | null; grapes: string | null;
};
type LinkResult = LabelResult & {
  description: string | null; image: string | null; price: number | null; source_url: string;
  offer: { price: number; quantity: number } | null; foreign_currency?: string | null;
};

const toNumber = (v: string) => {
  const n = Number(v.replace(',', '.').trim());
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};
const toText = (v: string) => v.trim() || null;

/** Asks Cloudflare AI where an unknown appellation lies and saves it (checked against the country in the database). */
async function locateAppellation(appellation: string | null, region: string | null, country: string | null) {
  if (!appellation || !country) return;
  const list = await loadAppellations();
  if (matchAppellation(list, appellation)) return;
  const key = `${normOrigin(appellation)}|${country}`;
  const { data: known } = await supabase.from('appellation_guesses').select('key').eq('key', key).maybeSingle();
  if (known) return;
  try {
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch('/api/locate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
      body: JSON.stringify({ appellation, region, country }),
    });
    const r = (await res.json()) as { found?: boolean; lat?: number; lon?: number };
    if (r.found) {
      await supabase.rpc('save_place_guess', { name: appellation, country, lat: r.lat, lon: r.lon });
      forgetGuesses();
    }
  } catch { /* the wine is saved; the map falls back to the country */ }
}

export function initWineAdmin(hostId: string, tenantId: string, hooks: { onSaved?: () => void; onDeleted?: () => void } = {}) {
  let wines: AdminWine[] = [];
  let editing: AdminWine | null = null;
  let pendingImage: Blob | null = null;
  let linkImage: string | null = null; // product image found via a shop link
  let sourceUrl: string | null = null;
  let removeImage = false;

  const form = $<HTMLFormElement>('wine-form');
  const panel = $<HTMLDialogElement>('wine-panel');
  $('wf-close').addEventListener('click', () => closeForm());
  panel.addEventListener('close', () => { editing = null; });
  const list = $<HTMLUListElement>('wine-admin-list');
  const field = <E extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id: string) => $<E>(id);

  // On a computer the photo tile uploads a picture; on a phone it opens the camera
  if (!matchMedia('(pointer: coarse)').matches) {
    const text = document.getElementById('wf-photo-text');
    if (text) { text.dataset.i18n = 'start.photoTextUpload'; text.textContent = t('start.photoTextUpload'); }
  }

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
    $('wf-regions').replaceChildren(...regs.sort((a, b) => a.name.localeCompare(b.name, lang()))
      .map((r) => new Option(country ? '' : countryName(r.country) ?? r.country, r.name)));
    const region = regionInput.value.trim();
    const apps = appellations.filter((a) => (!country || a.country === country) && (!region || sameRegion(a, region)));
    // An unknown region narrows nothing: show the whole country instead of an empty list
    const shown = apps.length ? apps : appellations.filter((a) => !country || a.country === country);
    $('wf-appellations').replaceChildren(...shown.map((a) =>
      new Option([a.subregion, a.region].filter(Boolean).join(' · ') + where(a.country), a.name)));
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
      const keep = editing && normOrigin(editing.producer) === normOrigin(field<HTMLInputElement>('wf-producer').value);
      const origin = { appellation: appInput.value.trim() || null, region: regionInput.value.trim() || null, country: countrySelect.value || null,
        producer: editing?.producer ?? null, producer_lat: keep ? editing!.producer_lat ?? null : null, producer_lon: keep ? editing!.producer_lon ?? null : null };
      const m = await wineMap(origin);
      if (turn !== mapTurn) return;
      const box = $('wf-map');
      box.hidden = !m;
      if (!m) return;
      $('wf-map-svg').innerHTML = m.svg;
      // How the wine was placed; an unknown appellation is looked up when the wine is saved
      const pending = (m.how === 'country' || m.how === 'regionCentre') && !!origin.appellation && !knownApp();
      $('wf-map-note').textContent = t(pending ? 'wineMap.pending' : `wineMap.${m.how}`);
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
  type StatusId = 'wf-label-status' | 'wf-link-status' | 'wf-start-status' | 'wf-source-status';
  let statusTarget: StatusId = 'wf-label-status';
  function labelStatus(text: string, kind: 'busy' | 'ok' | 'error' | '' = '') {
    for (const id of ['wf-label-status', 'wf-link-status', 'wf-start-status', 'wf-source-status']) {
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
    const set = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) => { el.value = v; el.classList.add('from-label'); };
    const put = (id: string, value: string | number | null | undefined) => {
      if (value == null || value === '') return;
      const el = field<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
      const v = String(value).replace('.', id === 'wf-abv' ? ',' : '.');
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
    f.put('wf-details', r.grapes ? `${t('label.grapes')}: ${r.grapes}` : null);
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
      sourceUrl = r.source_url;
      showSource();
      statusTarget = 'wf-source-status';
      const offer = r.offer
        ? ' ' + t(r.offer.quantity > 1 ? 'link.offerMany' : 'link.offerOne', { price: kr.format(r.offer.price), n: r.offer.quantity })
        : '';
      const foreign = r.foreign_currency && !field<HTMLInputElement>('wf-retail').value.trim()
        ? ' ' + t('link.foreignPrice', { currency: r.foreign_currency }) : '';
      fillStatus(f, t('link.filled', { n: '{n}' }), t('link.nothing'), offer + foreign);
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
    $('wf-image-remove').hidden = !url;
    $('wf-read-label').hidden = !pendingImage;
  }

  function openForm(w: AdminWine | null) {
    editing = w;
    pendingImage = null;
    removeImage = false;
    linkImage = null;
    sourceUrl = w?.source_url ?? null;
    form.reset();
    labelStatus('');
    form.querySelectorAll('.from-label').forEach((el) => el.classList.remove('from-label'));
    showMsg('');
    $('wf-title').textContent = w ? t('admin.editWine') : t('admin.newWine');
    $('wf-delete').hidden = !w;
    $('wf-delete').textContent = t('admin.deleteWine');
    delete $('wf-delete').dataset.armed;
    field<HTMLInputElement>('wf-name').value = w?.name ?? '';
    field<HTMLInputElement>('wf-producer').value = w?.producer ?? '';
    field<HTMLInputElement>('wf-producer-website').value = w?.producer_website ?? '';
    field<HTMLInputElement>('wf-producer-address').value = w?.producer_address ?? '';
    styleSelect.value = w?.style && (STYLES as readonly string[]).includes(w.style) ? w.style : '';
    field<HTMLInputElement>('wf-vintage').value = w?.vintage ?? '';
    field<HTMLInputElement>('wf-abv').value = w?.abv != null ? String(w.abv).replace('.', ',') : '';
    field<HTMLInputElement>('wf-retail').value = w?.retail_price_dkk != null ? String(w.retail_price_dkk) : '';
    field<HTMLInputElement>('wf-offer-price').value = w?.offer_price_dkk != null ? String(w.offer_price_dkk) : '';
    field<HTMLInputElement>('wf-offer-qty').value = w?.offer_quantity != null ? String(w.offer_quantity) : '';
    field<HTMLTextAreaElement>('wf-description').value = w?.description ?? '';
    field<HTMLTextAreaElement>('wf-details').value = w?.details ?? '';
    appInput.value = w?.appellation ?? '';
    regionInput.value = w?.region ?? '';
    countrySelect.value = w?.country ?? '';
    syncOrigin();
    setPreview(w?.image_url ?? null);
    // New wine: two tiles (photo / link) first; editing: the link field as before
    $('wf-start').hidden = !!w;
    // A wine fetched from a link shows where from (with Update) instead of an empty link field
    showSource();
    showLinkBox(!!w && !sourceUrl);
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

  function render() {
    list.replaceChildren();
    $('wine-empty').hidden = wines.length > 0;
    wines.forEach((w, i) => {
      const li = mk('li', 'wine-row');
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
      name.href = paths().get(w.id) ?? `/admin/wines/${w.id}/`;
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
      const ts = (w.tasting_wines ?? []).map((x) => x.tastings).filter(Boolean) as { slug: string; title: string }[];
      const chips = mk('div', 'chips');
      for (const tt of ts) {
        const a = mk('a', 'chip', tt.title);
        a.href = `/t/${tt.slug}/admin/`;
        chips.append(a);
      }
      if (!ts.length) chips.append(mk('span', 'chip', t('wineLib.unused')));
      body.append(chips);

      const actions = mk('div', 'wine-actions');
      const edit = mk('button', 'text-btn', t('admin.edit'));
      edit.type = 'button';
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
  }


  async function uploadImage(blob: Blob): Promise<string | null> {
    const path = `${hostId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) return null;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // ---------- Events ----------
  $('wine-add-toggle').addEventListener('click', () => openForm(null));
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
  field<HTMLInputElement>('wf-camera').addEventListener('change', (e) => useImage(e.target as HTMLInputElement, 'wf-start-status'));
  // The link tile shows the link field
  $('wf-start-link').addEventListener('click', () => {
    showLinkBox(true);
    field<HTMLInputElement>('wf-link').focus();
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
    // The link field is only needed for another link
    showLinkBox(false);
  }
  function showLinkBox(on: boolean) {
    $('wf-link-box').hidden = !on;
    $('wf-start-link').classList.toggle('active', on);
    $('wf-start-link').setAttribute('aria-expanded', String(on));
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
    if (!name) { showMsg(t('admin.wineNameMissing')); return; }

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
      abv: toNumber(field<HTMLInputElement>('wf-abv').value),
      retail_price_dkk: toNumber(field<HTMLInputElement>('wf-retail').value),
      offer_price_dkk: toNumber(field<HTMLInputElement>('wf-offer-price').value),
      offer_quantity: (() => {
        const n = Math.round(Number(field<HTMLInputElement>('wf-offer-qty').value.trim()));
        return n >= 1 && n <= 99 && field<HTMLInputElement>('wf-offer-price').value.trim() ? n : null;
      })(),
      description: toText(field<HTMLTextAreaElement>('wf-description').value),
      details: toText(field<HTMLTextAreaElement>('wf-details').value),
      appellation: toText(appInput.value),
      region: toText(regionInput.value),
      country: countrySelect.value || null,
      image_url,
      source_url: sourceUrl,
      producer_website: webUrl(field<HTMLInputElement>('wf-producer-website').value),
      producer_address: toText(field<HTMLInputElement>('wf-producer-address').value),
    };
    // A new producer or website: the place found earlier no longer applies and is looked up again
    const before = editing;
    const changed = !before || normOrigin(before.producer) !== normOrigin(row.producer)
      || (before.producer_website ?? null) !== row.producer_website;
    const place = changed ? { producer_lat: null, producer_lon: null, producer_source: null, producer_checked_at: null } : {};

    const { data: saved, error } = before
      ? await supabase.from('wines').update({ ...row, ...place }).eq('id', before.id).select('id').single()
      : await supabase.from('wines').insert({ ...row, ...place, host_id: hostId }).select('id').single();

    save.disabled = false;
    save.textContent = t('common.save');
    if (error) { showMsg(t('admin.wineNotSaved')); return; }
    // An appellation that is not on our list: find its place for the overview map (in the background)
    locateAppellation(row.appellation, row.region, row.country);
    closeForm();
    await load();
    hooks.onSaved?.();
    // The producer's website, address and place (in the background; the page updates when found)
    const id = (saved as { id: number } | null)?.id;
    if (id && row.producer && (changed || !before?.producer_checked_at)) {
      locateProducer(id, { ...row, name }).then((found) => { if (found) { load(); hooks.onSaved?.(); } });
    }
  });

  /** Finds the producer's website and place: from another wine by the same producer, else /api/find-producer. */
  async function locateProducer(id: number, w: { name: string; producer: string | null; appellation: string | null; region: string | null; country: string | null; producer_website: string | null; producer_address: string | null }) {
    const same = wines.find((x) => x.id !== id && x.producer_checked_at && normOrigin(x.producer) === normOrigin(w.producer)
      && (!w.producer_website || x.producer_website === w.producer_website));
    let found: { website: string | null; address: string | null; lat: number | null; lon: number | null; source: string | null };
    if (same) {
      found = { website: same.producer_website ?? null, address: same.producer_address ?? null, lat: same.producer_lat ?? null, lon: same.producer_lon ?? null, source: same.producer_source ?? null };
    } else {
      try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch('/api/find-producer', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
          body: JSON.stringify({ producer: w.producer, wine: w.name, appellation: w.appellation, region: w.region, country: w.country, website: w.producer_website }),
        });
        if (!res.ok) return false;
        const r = (await res.json()) as { website: string | null; address: string | null; location: { lat: number; lon: number; source: string } | null };
        found = { website: r.website, address: r.address, lat: r.location?.lat ?? null, lon: r.location?.lon ?? null, source: r.location?.source ?? null };
      } catch { return false; }
    }
    // What the host typed stays; the lookup fills the rest
    const { error } = await supabase.from('wines').update({
      producer_website: w.producer_website ?? webUrl(found.website ?? ''),
      producer_address: w.producer_address ?? found.address,
      producer_lat: found.lat, producer_lon: found.lat == null ? null : found.lon,
      producer_source: found.source,
      producer_checked_at: new Date().toISOString(),
    }).eq('id', id);
    return !error;
  }

  // Delete in two steps instead of a browser dialog
  $('wf-delete').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('wf-delete');
    if (!editing) return;
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = t('admin.confirmDelete');
      return;
    }
    const { error } = await supabase.from('wines').delete().eq('id', editing.id);
    if (error) {
      showMsg(t('admin.wineOrdered'));
      delete btn.dataset.armed;
      btn.textContent = t('admin.deleteWine');
      return;
    }
    closeForm();
    if (hooks.onDeleted) { hooks.onDeleted(); return; }
    await load();
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

  return { load, edit, paths };
}
