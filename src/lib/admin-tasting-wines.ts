// Admin, one tasting: which library wines are in it, in what order, at what guest price,
// and whether guests can see and order them. Ratings from the guests are shown per wine.
import { supabase } from './supabase';
import { $, mk, toNumber } from './admin-common';
import { styleName } from './wines';
import { t, locale } from '../i18n';

type LibWine = { id: number; name: string; producer: string | null; style: string | null; vintage: string | null;
  image_url: string | null; retail_price_dkk: number | null;
  offer_price_dkk: number | null; offer_quantity: number | null };
type Row = { wine_id: number; sort_order: number; price_dkk: number | null; orderable: boolean; revealed: boolean;
  bulk_price_dkk: number | null; bulk_quantity: number | null; wines: LibWine };
export type TastingWine = { id: number; name: string; price_dkk: number | null; sort_order: number };

export function initTastingWines(tastingId: string, hostId: string, onChange: (wines: TastingWine[]) => void) {
  let rows: Row[] = [];
  let library: LibWine[] = [];
  let ratings = new Map<number, { average: number; votes: number }>();
  const list = $<HTMLUListElement>('tw-list');

  const meta = (w: LibWine) => [w.style ? styleName(w.style) : null, w.vintage, w.producer].filter(Boolean).join(' · ');

  function thumb(w: LibWine) {
    const box = mk('div', 'wine-thumb');
    if (w.image_url) {
      const img = mk('img');
      img.src = w.image_url;
      img.alt = '';
      img.loading = 'lazy';
      box.append(img);
    }
    return box;
  }

  async function update(r: Row, patch: Partial<Pick<Row, 'price_dkk' | 'orderable' | 'revealed' | 'sort_order' | 'bulk_price_dkk' | 'bulk_quantity'>>) {
    const { error } = await supabase.from('tasting_wines').update(patch)
      .eq('tasting_id', tastingId).eq('wine_id', r.wine_id);
    if (error) { alert(t('admin.changeNotSaved')); return false; }
    Object.assign(r, patch);
    emit();
    return true;
  }

  function render() {
    list.replaceChildren();
    $('tw-empty').hidden = rows.length > 0;
    rows.forEach((r, i) => {
      const w = r.wines;
      const li = mk('li', 'tw-row');
      const body = mk('div');
      body.append(mk('p', 'lib-name', w.name));
      const m = meta(w);
      if (m) body.append(mk('p', 'lib-meta', m));
      const rating = ratings.get(r.wine_id);
      if (rating) {
        const avg = rating.average.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        body.append(mk('p', 'lib-meta wine-rating', t(rating.votes === 1 ? 'rating.avgOne' : 'rating.avgMany', { avg, n: rating.votes })));
      }

      // Guest price, visible, orderable – saved as soon as they change
      const controls = mk('div', 'tw-controls');
      const priceLab = mk('label');
      const price = mk('input');
      price.type = 'text';
      price.inputMode = 'decimal';
      price.value = r.price_dkk != null ? String(r.price_dkk).replace('.', ',') : '';
      price.placeholder = w.retail_price_dkk != null ? String(w.retail_price_dkk) : '';
      price.setAttribute('aria-label', t('admin.price'));
      price.addEventListener('change', async () => {
        const ok = await update(r, { price_dkk: toNumber(price.value) });
        if (ok) price.classList.add('saved');
      });
      priceLab.append(mk('span', '', t('adminTasting.guestPrice')), price);

      // Quantity price: "from [6] bottles: [80] kr."
      const bulkLab = mk('label', 'bulk-lab');
      const qty = mk('input');
      qty.type = 'text';
      qty.inputMode = 'numeric';
      qty.className = 'qty';
      qty.value = r.bulk_quantity != null ? String(r.bulk_quantity) : '';
      qty.placeholder = '6';
      qty.setAttribute('aria-label', t('adminTasting.bulkQty'));
      const bulk = mk('input');
      bulk.type = 'text';
      bulk.inputMode = 'decimal';
      bulk.value = r.bulk_price_dkk != null ? String(r.bulk_price_dkk).replace('.', ',') : '';
      bulk.setAttribute('aria-label', t('adminTasting.bulkPrice'));
      const saveBulk = async () => {
        const n = Math.round(Number(qty.value.trim()));
        const p = toNumber(bulk.value);
        const valid = Number.isFinite(n) && n >= 2 && n <= 99 && p != null;
        if ((qty.value.trim() || bulk.value.trim()) && !valid) return; // wait until both make sense
        const ok = await update(r, valid ? { bulk_quantity: n, bulk_price_dkk: p } : { bulk_quantity: null, bulk_price_dkk: null });
        if (ok) { qty.classList.add('saved'); bulk.classList.add('saved'); }
      };
      qty.addEventListener('change', saveBulk);
      bulk.addEventListener('change', saveBulk);
      bulkLab.append(mk('span', '', t('adminTasting.bulkFrom')), qty, mk('span', '', t('adminTasting.bulkBottles')), bulk);
      const vis = mk('label');
      const visCb = mk('input');
      visCb.type = 'checkbox';
      visCb.checked = r.revealed;
      visCb.addEventListener('change', async () => { if (!(await update(r, { revealed: visCb.checked }))) visCb.checked = !visCb.checked; });
      vis.append(visCb, mk('span', '', t('admin.revealed')));
      const ord = mk('label');
      const ordCb = mk('input');
      ordCb.type = 'checkbox';
      ordCb.checked = r.orderable;
      ordCb.addEventListener('change', async () => { if (!(await update(r, { orderable: ordCb.checked }))) ordCb.checked = !ordCb.checked; });
      ord.append(ordCb, mk('span', '', t('admin.orderable')));
      controls.append(priceLab, bulkLab, vis, ord);
      body.append(controls);

      const actions = mk('div', 'wine-actions');
      const up = mk('button', 'icon-only', '↑');
      up.type = 'button';
      up.setAttribute('aria-label', t('admin.moveUp', { name: w.name }));
      up.disabled = i === 0;
      up.addEventListener('click', () => move(i, -1));
      const down = mk('button', 'icon-only', '↓');
      down.type = 'button';
      down.setAttribute('aria-label', t('admin.moveDown', { name: w.name }));
      down.disabled = i === rows.length - 1;
      down.addEventListener('click', () => move(i, 1));
      const remove = mk('button', 'text-btn', t('adminTasting.remove'));
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!remove.dataset.armed) { remove.dataset.armed = '1'; remove.textContent = t('adminTasting.confirmRemove'); return; }
        const { error } = await supabase.from('tasting_wines').delete().eq('tasting_id', tastingId).eq('wine_id', r.wine_id);
        if (error) { alert(t('admin.changeNotSaved')); return; }
        rows = rows.filter((x) => x !== r);
        render();
      });
      actions.append(up, down, remove);

      li.append(thumb(w), body, actions);
      list.append(li);
    });
    renderPicker();
    emit();
  }

  function emit() {
    onChange(rows.map((r) => ({ id: r.wine_id, name: r.wines.name, price_dkk: r.price_dkk, sort_order: r.sort_order })));
  }

  async function move(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (other < 0 || other >= rows.length) return;
    [rows[index], rows[other]] = [rows[other], rows[index]];
    rows.forEach((r, i) => (r.sort_order = i + 1));
    render();
    await Promise.all([rows[index], rows[other]].map((r) =>
      supabase.from('tasting_wines').update({ sort_order: r.sort_order }).eq('tasting_id', tastingId).eq('wine_id', r.wine_id)));
  }

  // ---------- Picker: add wines from the library ----------
  function renderPicker() {
    const q = $<HTMLInputElement>('tw-search').value.trim().toLowerCase();
    const inTasting = new Set(rows.map((r) => r.wine_id));
    const candidates = library.filter((w) => !inTasting.has(w.id))
      .filter((w) => !q || `${w.name} ${w.producer ?? ''} ${w.vintage ?? ''}`.toLowerCase().includes(q));
    const ul = $<HTMLUListElement>('tw-picker-list');
    ul.replaceChildren(...candidates.map((w) => {
      const li = mk('li');
      const text = mk('div');
      text.append(mk('p', 'lib-name', w.name));
      const m = meta(w);
      if (m) text.append(mk('p', 'lib-meta', m));
      const add = mk('button', 'btn small ghost', t('admin.add'));
      add.type = 'button';
      add.addEventListener('click', async () => {
        add.disabled = true;
        const sort = rows.reduce((mx, r) => Math.max(mx, r.sort_order), 0) + 1;
        // Start from the regular price, and the shop's offer as quantity price when it is for several bottles
        const bulkFrom = w.offer_quantity && w.offer_quantity >= 2 && w.offer_price_dkk != null;
        const row = {
          tasting_id: tastingId, wine_id: w.id, sort_order: sort, price_dkk: w.retail_price_dkk,
          bulk_quantity: bulkFrom ? w.offer_quantity : null, bulk_price_dkk: bulkFrom ? w.offer_price_dkk : null,
        };
        const { error } = await supabase.from('tasting_wines').insert(row);
        if (error) { add.disabled = false; alert(t('admin.changeNotSaved')); return; }
        rows.push({ ...row, orderable: true, revealed: true, wines: w });
        render();
      });
      li.append(text, add);
      return li;
    }));
    $('tw-picker-empty').hidden = candidates.length > 0;
  }

  $('tw-add-toggle').addEventListener('click', () => {
    $('tw-picker').hidden = false;
    $('tw-add-toggle').hidden = true;
    $<HTMLInputElement>('tw-search').focus();
  });
  $('tw-picker-close').addEventListener('click', () => {
    $('tw-picker').hidden = true;
    $('tw-add-toggle').hidden = false;
  });
  $('tw-search').addEventListener('input', renderPicker);

  async function load() {
    const cols = 'id, name, producer, style, vintage, image_url, retail_price_dkk, offer_price_dkk, offer_quantity';
    const [tw, lib, r] = await Promise.all([
      supabase.from('tasting_wines').select(`wine_id, sort_order, price_dkk, bulk_price_dkk, bulk_quantity, orderable, revealed, wines(${cols})`)
        .eq('tasting_id', tastingId).order('sort_order'),
      supabase.from('wines').select(cols).eq('host_id', hostId).order('name'),
      supabase.rpc('tasting_wine_ratings', { t_id: tastingId }),
    ]);
    rows = (tw.data ?? []) as unknown as Row[];
    library = (lib.data ?? []) as LibWine[];
    ratings = new Map(((r.data ?? []) as { wine_id: number; average: number; votes: number }[])
      .map((x) => [x.wine_id, { average: Number(x.average), votes: x.votes }]));
    render();
  }

  return { load };
}

