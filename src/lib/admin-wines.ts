// Admin: the host adds, edits, reorders and deletes wines one at a time, with an optional photo.
import { supabase } from './supabase';
import { STYLE_LABELS, kr } from './wines';

export type AdminWine = {
  id: number; tasting_id: string; sort_order: number; name: string; producer: string | null;
  style: string | null; vintage: string | null; abv: number | null; price_dkk: number | null;
  retail_price_dkk: number | null; description: string | null; details: string | null;
  image_url: string | null; orderable: boolean; revealed: boolean;
};

const COLUMNS = 'id, tasting_id, sort_order, name, producer, style, vintage, abv, price_dkk, retail_price_dkk, description, details, image_url, orderable, revealed';
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

const toNumber = (v: string) => {
  const n = Number(v.replace(',', '.').trim());
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};
const toText = (v: string) => v.trim() || null;

export function initWineAdmin(tastingId: string, onChange: (wines: AdminWine[]) => void) {
  let wines: AdminWine[] = [];
  let editing: AdminWine | null = null;
  let pendingImage: Blob | null = null;
  let removeImage = false;

  const form = $<HTMLFormElement>('wine-form');
  const list = $<HTMLUListElement>('wine-admin-list');
  const field = <E extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id: string) => $<E>(id);

  // Style options
  const styleSelect = field<HTMLSelectElement>('wf-style');
  styleSelect.replaceChildren(new Option('Vælg …', ''));
  for (const [key, label] of Object.entries(STYLE_LABELS)) styleSelect.append(new Option(label, key));

  function showMsg(text: string, ok = false) {
    const m = $('wf-msg');
    m.textContent = text;
    m.className = 'message ' + (ok ? 'ok' : 'error');
    m.hidden = !text;
  }

  function setPreview(url: string | null) {
    const img = $<HTMLImageElement>('wf-preview');
    img.hidden = !url;
    if (url) img.src = url;
    $('wf-image-remove').hidden = !url;
  }

  function openForm(w: AdminWine | null) {
    editing = w;
    pendingImage = null;
    removeImage = false;
    form.reset();
    showMsg('');
    $('wf-title').textContent = w ? 'Ret vin' : 'Ny vin';
    $('wf-delete').hidden = !w;
    $('wf-delete').textContent = 'Slet vin';
    delete $('wf-delete').dataset.armed;
    field<HTMLInputElement>('wf-name').value = w?.name ?? '';
    field<HTMLInputElement>('wf-producer').value = w?.producer ?? '';
    styleSelect.value = w?.style && STYLE_LABELS[w.style] ? w.style : '';
    field<HTMLInputElement>('wf-vintage').value = w?.vintage ?? '';
    field<HTMLInputElement>('wf-abv').value = w?.abv != null ? String(w.abv).replace('.', ',') : '';
    field<HTMLInputElement>('wf-price').value = w?.price_dkk != null ? String(w.price_dkk) : '';
    field<HTMLInputElement>('wf-retail').value = w?.retail_price_dkk != null ? String(w.retail_price_dkk) : '';
    field<HTMLTextAreaElement>('wf-description').value = w?.description ?? '';
    field<HTMLTextAreaElement>('wf-details').value = w?.details ?? '';
    field<HTMLInputElement>('wf-orderable').checked = w ? w.orderable : true;
    field<HTMLInputElement>('wf-revealed').checked = w ? w.revealed : true;
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
      const meta = [STYLE_LABELS[w.style ?? ''] ?? w.style, w.vintage, w.producer].filter(Boolean).join(' · ');
      if (meta) body.append(mk('p', 'wine-meta', meta));
      const prices = mk('p', 'wine-meta');
      prices.textContent = w.price_dkk != null ? kr.format(w.price_dkk) : 'Ingen pris';
      if (w.retail_price_dkk != null) prices.textContent += ` (normalt ${kr.format(w.retail_price_dkk)})`;
      body.append(prices);
      const flags = mk('div', 'wine-flags');
      if (!w.revealed) flags.append(mk('span', 'pill pill-no', 'Skjult for gæster'));
      if (!w.orderable) flags.append(mk('span', 'pill pill-no', 'Kan ikke bestilles'));
      if (flags.childElementCount) body.append(flags);

      const actions = mk('div', 'wine-actions');
      const up = mk('button', 'icon-only', '↑');
      up.type = 'button';
      up.setAttribute('aria-label', `Flyt ${w.name} op`);
      up.disabled = i === 0;
      up.addEventListener('click', () => move(i, -1));
      const down = mk('button', 'icon-only', '↓');
      down.type = 'button';
      down.setAttribute('aria-label', `Flyt ${w.name} ned`);
      down.disabled = i === wines.length - 1;
      down.addEventListener('click', () => move(i, 1));
      const edit = mk('button', 'text-btn', 'Ret');
      edit.type = 'button';
      edit.addEventListener('click', () => openForm(w));
      actions.append(up, down, edit);

      li.append(thumb, body, actions);
      list.append(li);
    });
    onChange(wines);
  }

  async function load() {
    const { data } = await supabase.from('wines').select(COLUMNS).eq('tasting_id', tastingId).order('sort_order').order('id');
    wines = (data ?? []) as AdminWine[];
    render();
  }

  async function move(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (other < 0 || other >= wines.length) return;
    [wines[index], wines[other]] = [wines[other], wines[index]];
    wines.forEach((w, i) => (w.sort_order = i + 1));
    render();
    await Promise.all(
      [wines[index], wines[other]].map((w) => supabase.from('wines').update({ sort_order: w.sort_order }).eq('id', w.id)),
    );
  }

  async function uploadImage(blob: Blob): Promise<string | null> {
    const path = `${tastingId}/${crypto.randomUUID()}.jpg`;
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
  });

  $('wf-image-remove').addEventListener('click', () => {
    pendingImage = null;
    removeImage = true;
    field<HTMLInputElement>('wf-image').value = '';
    setPreview(null);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = field<HTMLInputElement>('wf-name').value.trim();
    if (!name) { showMsg('Giv vinen et navn.'); return; }

    const save = $<HTMLButtonElement>('wf-save');
    save.disabled = true;
    save.textContent = 'Gemmer …';

    let image_url = editing?.image_url ?? null;
    if (removeImage) image_url = null;
    if (pendingImage) {
      const url = await uploadImage(pendingImage);
      if (!url) {
        save.disabled = false;
        save.textContent = 'Gem';
        showMsg('Billedet kunne ikke lægges op. Prøv et andet billede, eller gem uden.');
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
      price_dkk: toNumber(field<HTMLInputElement>('wf-price').value),
      retail_price_dkk: toNumber(field<HTMLInputElement>('wf-retail').value),
      description: toText(field<HTMLTextAreaElement>('wf-description').value),
      details: toText(field<HTMLTextAreaElement>('wf-details').value),
      orderable: field<HTMLInputElement>('wf-orderable').checked,
      revealed: field<HTMLInputElement>('wf-revealed').checked,
      image_url,
    };

    const { error } = editing
      ? await supabase.from('wines').update(row).eq('id', editing.id)
      : await supabase.from('wines').insert({
          ...row,
          tasting_id: tastingId,
          sort_order: wines.reduce((m, w) => Math.max(m, w.sort_order), 0) + 1,
        });

    save.disabled = false;
    save.textContent = 'Gem';
    if (error) { showMsg('Vinen blev ikke gemt. Prøv igen.'); return; }
    closeForm();
    await load();
  });

  // Delete in two steps instead of a browser dialog
  $('wf-delete').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('wf-delete');
    if (!editing) return;
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Tryk igen for at slette';
      return;
    }
    const { error } = await supabase.from('wines').delete().eq('id', editing.id);
    if (error) {
      showMsg('Vinen er bestilt af en gæst og kan ikke slettes. Fjern fluebenet ved "Kan bestilles" eller "Vis for gæster" i stedet.');
      delete btn.dataset.armed;
      btn.textContent = 'Slet vin';
      return;
    }
    closeForm();
    await load();
  });

  return { load };
}
