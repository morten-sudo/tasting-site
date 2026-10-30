// Admin, wine library: the host's wines across all tastings – add, edit and delete one at a time,
// filled in from a label photo or a shop link. Prices and visibility per tasting live on the tasting page.
import { supabase } from './supabase';
import { STYLES, styleName, kr } from './wines';
import { t, lang, locale } from '../i18n';

export type AdminWine = {
  id: number; host_id: string; name: string; producer: string | null;
  style: string | null; vintage: string | null; abv: number | null;
  retail_price_dkk: number | null; description: string | null; details: string | null;
  image_url: string | null; source_url: string | null;
  offer_price_dkk: number | null; offer_quantity: number | null;
  tasting_wines?: { tastings: { slug: string; title: string } | null }[];
};

const COLUMNS = 'id, host_id, name, producer, style, vintage, abv, retail_price_dkk, offer_price_dkk, offer_quantity, description, details, image_url, source_url, tasting_wines(tastings(slug, title))';
const BUCKET = 'wine-images';
const MAX_IMAGE_SIDE = 1400;

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

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
  abv: number | null; region: string | null; country: string | null; grapes: string | null;
};
type LinkResult = LabelResult & {
  description: string | null; image: string | null; price: number | null; source_url: string;
  offer: { price: number; quantity: number } | null;
};

const toNumber = (v: string) => {
  const n = Number(v.replace(',', '.').trim());
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};
const toText = (v: string) => v.trim() || null;

export function initWineAdmin(hostId: string) {
  let wines: AdminWine[] = [];
  let editing: AdminWine | null = null;
  let pendingImage: Blob | null = null;
  let linkImage: string | null = null; // product image found via a shop link
  let sourceUrl: string | null = null;
  let removeImage = false;

  const form = $<HTMLFormElement>('wine-form');
  const list = $<HTMLUListElement>('wine-admin-list');
  const field = <E extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id: string) => $<E>(id);

  // Style options
  const styleSelect = field<HTMLSelectElement>('wf-style');
  styleSelect.replaceChildren(new Option(t('admin.choose'), ''));
  for (const key of STYLES) styleSelect.append(new Option(styleName(key), key));

  function showMsg(text: string, ok = false) {
    const m = $('wf-msg');
    m.textContent = text;
    m.className = 'message ' + (ok ? 'ok' : 'error');
    m.hidden = !text;
  }

  // ---------- Read the label (Cloudflare Workers AI via /api/read-label) ----------
  function labelStatus(text: string, kind: 'busy' | 'ok' | 'error' | '' = '') {
    const el = $('wf-label-status');
    el.textContent = text;
    el.className = 'label-status' + (kind ? ' ' + kind : '');
    el.hidden = !text;
  }

  async function readLabel() {
    if (!pendingImage) return;
    const btn = $<HTMLButtonElement>('wf-read-label');
    btn.disabled = true;
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
      const filled = fillFromLabel(r);
      labelStatus(filled ? t('label.filled', { n: filled }) : t('label.nothing'), filled ? 'ok' : 'error');
    } catch {
      labelStatus(t('label.failed'), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /** Fills only empty fields, so nothing the host typed is overwritten. Returns how many were filled. */
  function fillFromLabel(r: LabelResult) {
    let n = 0;
    const put = (id: string, value: string | number | null) => {
      const el = field<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
      if (value == null || value === '' || el.value.trim()) return;
      el.value = String(value).replace('.', id === 'wf-abv' ? ',' : '.');
      el.classList.add('from-label');
      n++;
    };
    put('wf-name', r.name);
    put('wf-producer', r.producer);
    put('wf-vintage', r.vintage);
    if (r.style && !styleSelect.value) { styleSelect.value = r.style; styleSelect.classList.add('from-label'); n++; }
    put('wf-abv', r.abv);
    const lines = [
      r.grapes ? `${t('label.grapes')}: ${r.grapes}` : null,
      r.region || r.country ? `${t('label.region')}: ${[r.region, r.country].filter(Boolean).join(', ')}` : null,
    ].filter(Boolean).join('\n');
    put('wf-details', lines || null);
    return n;
  }

  // ---------- Fetch from a shop link (/api/read-link) ----------
  async function readLink() {
    const input = field<HTMLInputElement>('wf-link');
    const url = input.value.trim();
    if (!/^https?:\/\//i.test(url)) { labelStatus(t('link.invalid'), 'error'); return; }
    const btn = $<HTMLButtonElement>('wf-read-link');
    btn.disabled = true;
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
      let n = fillFromLabel(r);
      const put = (id: string, value: string | null) => {
        const el = field<HTMLInputElement | HTMLTextAreaElement>(id);
        if (!value || el.value.trim()) return;
        el.value = value;
        el.classList.add('from-label');
        n++;
      };
      put('wf-description', r.description);
      put('wf-retail', r.price != null ? String(r.price) : null);
      if (r.offer) {
        put('wf-offer-price', String(r.offer.price));
        put('wf-offer-qty', String(r.offer.quantity));
      }
      if (r.image && !pendingImage && $<HTMLImageElement>('wf-preview').hidden) {
        linkImage = r.image;
        removeImage = false;
        setPreview(r.image);
        n++;
      }
      sourceUrl = r.source_url;
      const offer = r.offer
        ? ' ' + t(r.offer.quantity > 1 ? 'link.offerMany' : 'link.offerOne', { price: kr.format(r.offer.price), n: r.offer.quantity })
        : '';
      labelStatus((n ? t('link.filled', { n }) : t('label.nothing')) + offer, n ? 'ok' : 'error');
    } catch {
      labelStatus(t('link.failed'), 'error');
    } finally {
      btn.disabled = false;
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
    styleSelect.value = w?.style && (STYLES as readonly string[]).includes(w.style) ? w.style : '';
    field<HTMLInputElement>('wf-vintage').value = w?.vintage ?? '';
    field<HTMLInputElement>('wf-abv').value = w?.abv != null ? String(w.abv).replace('.', ',') : '';
    field<HTMLInputElement>('wf-retail').value = w?.retail_price_dkk != null ? String(w.retail_price_dkk) : '';
    field<HTMLInputElement>('wf-offer-price').value = w?.offer_price_dkk != null ? String(w.offer_price_dkk) : '';
    field<HTMLInputElement>('wf-offer-qty').value = w?.offer_quantity != null ? String(w.offer_quantity) : '';
    field<HTMLTextAreaElement>('wf-description').value = w?.description ?? '';
    field<HTMLTextAreaElement>('wf-details').value = w?.details ?? '';
    setPreview(w?.image_url ?? null);
    form.hidden = false;
    $('wine-add-toggle').hidden = true;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    field<HTMLInputElement>('wf-name').focus({ preventScroll: true });
  }

  function closeForm() {
    editing = null;
    form.hidden = true;
    $('wine-add-toggle').hidden = false;
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
      body.append(mk('p', 'wine-name', w.name));
      const meta = [w.style ? styleName(w.style) : null, w.vintage, w.producer].filter(Boolean).join(' · ');
      if (meta) body.append(mk('p', 'wine-meta', meta));
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
    const { data } = await supabase.from('wines').select(COLUMNS).eq('host_id', hostId).order('name');
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

  field<HTMLInputElement>('wf-image').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    pendingImage = await shrinkImage(file);
    removeImage = false;
    setPreview(URL.createObjectURL(pendingImage));
    // A new wine: read the label straight away
    if (!editing) readLabel();
  });

  $('wf-read-label').addEventListener('click', readLabel);
  $('wf-nv').addEventListener('click', () => { field<HTMLInputElement>('wf-vintage').value = 'NV'; });
  $('wf-read-link').addEventListener('click', readLink);
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
    const name = field<HTMLInputElement>('wf-name').value.trim();
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
      image_url,
      source_url: sourceUrl,
    };

    const { error } = editing
      ? await supabase.from('wines').update(row).eq('id', editing.id)
      : await supabase.from('wines').insert({
          ...row,
          host_id: hostId,
        });

    save.disabled = false;
    save.textContent = t('common.save');
    if (error) { showMsg(t('admin.wineNotSaved')); return; }
    closeForm();
    await load();
  });

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
    await load();
  });

  return { load };
}
