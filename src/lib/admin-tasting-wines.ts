// Admin, one tasting: which library wines are in it, in what order, at what guest price,
// and whether guests can see (fully, or blind) and order them. Ratings from the guests are shown per wine.
import { statusChip } from './ui/status';
import { starsRo } from './ui/stars';
import { supabase } from './supabase';
import { $, mk, sheetPanel, iconButton } from './admin-common';
import { listRow, rowPrice } from './ui/list-row';
import { wineThumb } from './ui/thumb';
import { highlight } from './ui/highlight';
import { deleteWithUndo } from './ui/delete-undo';
import { reorder } from './ui/reorder';
import { stepper, type Stepper } from './ui/stepper';
import { styleName } from './wines';
import { initHelpTips } from './help-tip';
import { t, locale, money } from '../i18n';
import { amountText, parseAmount } from './wine-validate';
import { fieldError } from './field-error';
import { toast } from './toast';
import { confirmModal } from './ui/confirm';
import { initQuickAdd } from './wine-quick-add';
import { winePaths } from './wine-paths';

type LibWine = { id: number; name: string; producer: string | null; style: string | null; vintage: string | null;
  country: string | null; region: string | null; appellation: string | null;
  image_url: string | null; source_url: string | null; retail_price_dkk: number | null;
  offer_price_dkk: number | null; offer_quantity: number | null };
type Row = { wine_id: number; sort_order: number; price_dkk: number | null; orderable: boolean; revealed: boolean; blind: boolean;
  price_tiers: Tier[]; wines: LibWine };
type Tier = { qty: number; price: number };
export type TastingWine = { id: number; name: string; price_dkk: number | null; sort_order: number; tiers: Tier[] };

const COLS = 'id, name, producer, style, vintage, country, region, appellation, image_url, source_url, retail_price_dkk, offer_price_dkk, offer_quantity';

export function initTastingWines(tastingId: string, hostId: string, tenantId: string, onChange: (wines: TastingWine[]) => void) {
  let rows: Row[] = [];
  let library: LibWine[] = [];
  let ratings = new Map<number, { average: number; votes: number }>();
  const list = $<HTMLUListElement>('tw-list');

  /** A wine's address in the library (its real one, worked out from all the account's wines) */
  const wineHref = (id: number) => winePaths(library).get(id) ?? '/admin/wines/';
  const meta = (w: LibWine) => [w.style ? styleName(w.style) : null, w.vintage, w.producer].filter(Boolean).join(' · ');

  async function update(r: Row, patch: Partial<Pick<Row, 'price_dkk' | 'orderable' | 'revealed' | 'blind' | 'sort_order' | 'price_tiers'>>) {
    const { error } = await supabase.from('tasting_wines').update(patch)
      .eq('tasting_id', tastingId).eq('wine_id', r.wine_id);
    if (error) { toast(t('admin.changeNotSaved'), { kind: 'error' }); return false; }
    Object.assign(r, patch);
    emit();
    return true;
  }

  /** "409,95 kr." and "from 6 bottles 249,95 kr." – how the price reads in the list */
  const kr = (n: number) => money(n);
  const tiersOf = (r: Row) => [...(r.price_tiers ?? [])].sort((a, b) => a.qty - b.qty);
  const visOf = (r: Row): 'shown' | 'blind' | 'hidden' => (!r.revealed ? 'hidden' : r.blind ? 'blind' : 'shown');

  // The list: one calm line per wine – what it is, its price, what the guests see. Settings are in the panel.
  function render() {
    $('tw-empty').hidden = rows.length > 0;
    list.hidden = !rows.length;
    list.replaceChildren(...rows.map((r, i) => {
      const w = r.wines;
      const vis = visOf(r);
      const chips: HTMLElement[] = [
        statusChip(vis === 'shown' ? 'wine.shown' : vis === 'blind' ? 'wine.blind' : 'wine.hidden'),
        statusChip(r.orderable ? 'wine.orderable' : 'wine.notOrderable'),
      ];
      const rating = ratings.get(r.wine_id);
      if (rating) {
        const avg = rating.average.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        chips.push(starsRo(rating.average, ' ' + t(rating.votes === 1 ? 'rating.avgOne' : 'rating.avgMany', { avg, n: rating.votes }), { chip: true }));
      }
      const actions: HTMLElement[] = [];
      // Reveal a blind wine with one click, in whatever order suits the evening
      if (vis === 'blind') {
        const reveal = iconButton('reveal', `${t('blind.reveal')}: ${w.name}`, { strong: true });
        reveal.dataset.tip = t('blind.reveal');
        reveal.addEventListener('click', async () => {
          reveal.disabled = true;
          if (await update(r, { blind: false })) { render(); toast(t('twe.revealed', { name: w.name }), { kind: 'ok' }); }
          else reveal.disabled = false;
        });
        actions.push(reveal);
      }
      const editBtn = iconButton('edit', `${t('admin.edit')}: ${w.name}`);
      editBtn.dataset.tip = t('admin.edit');
      editBtn.addEventListener('click', () => edit(r));
      // Remove from the tasting (not from the library): a quiet trash icon, asked first, with Undo
      const del = iconButton('trash', `${t('twe.remove')}: ${w.name}`, { quiet: true });
      del.dataset.tip = t('twe.remove');
      del.addEventListener('click', () => removeWine(r));
      actions.push(editBtn, del);
      // The grip moves the wine: drag it (mouse or finger), or ↑/↓ when it has the focus (reorder.ts)
      // The name opens the wine's own page in the library (origin, map, description); the pencil edits it here
      return listRow({
        id: r.wine_id, grip: { label: t('twe.move', { name: w.name }), tip: t('twe.moveHint') }, no: i + 1, pic: wineThumb(w),
        title: w.name, href: wineHref(w.id), meta: [meta(w)], chips,
        aside: rowPrice(r.price_dkk != null ? kr(r.price_dkk) : t('twe.noPrice'), tiersOf(r).map((x) => t('twe.tierLine', { n: x.qty, price: kr(x.price) }))),
        actions,
      });
    }));
    emit();
  }

  // ---------- Reorder: drag the grip, or ↑/↓ on it (the one reorder, src/lib/ui/reorder.ts) ----------
  reorder(list, {
    live: $('tw-move-help'),
    announce: (n, total, li) => t('twe.moved', { name: rows.find((x) => String(x.wine_id) === li.dataset.id)?.wines.name ?? '', n, total }),
    save: async (ids) => {
      const byId = new Map(rows.map((r) => [String(r.wine_id), r]));
      rows = ids.map((id) => byId.get(id)!).filter(Boolean);
      const changed = rows.filter((r, i) => r.sort_order !== i + 1);
      rows.forEach((r, i) => (r.sort_order = i + 1));
      emit();
      const res = await Promise.all(changed.map((r) =>
        supabase.from('tasting_wines').update({ sort_order: r.sort_order }).eq('tasting_id', tastingId).eq('wine_id', r.wine_id)));
      if (res.some((x) => x.error)) { toast(t('admin.changeNotSaved'), { kind: 'error' }); return false; }
      return true;
    },
  });

  // ---------- Edit one wine in the side panel ----------
  const editPanel = sheetPanel($<HTMLDialogElement>('tw-edit'), { dirty: 'form' });
  let editing: Row | null = null;
  let tierRows: { qty: Stepper; price: HTMLInputElement }[] = [];
  // "From [− 6 +] bottles: [109,95 kr.] each" – the number of bottles with the stepper, the price with its unit inside
  function tierRow(qty = 6, price = '') {
    const row = mk('div', 'twe-tier');
    const line = mk('div', 'twe-tier-line');
    const q = stepper({ value: qty, min: 2, max: 99, small: true, label: t('adminTasting.bulkQty') });
    const p = mk('input');
    p.type = 'text'; p.inputMode = 'decimal'; p.className = 'input'; p.value = price; p.autocomplete = 'off';
    p.id = `twe-p-${Math.random().toString(36).slice(2, 8)}`;
    p.setAttribute('aria-label', t('adminTasting.bulkPrice'));
    const del = iconButton('trash', t('twe.removeTier'), { quiet: true });
    const entry = { qty: q, price: p };
    // A row with a price is asked about first
    del.addEventListener('click', async () => {
      if (p.value.trim() && !(await confirmModal({ title: t('twe.removeTierQ'), ok: t('twe.removeTier'), danger: true,
        text: t('twe.tierLine', { n: q.value, price: `${p.value.trim()} ${t('unit.kr')}` }).replace(/^./, (c) => c.toUpperCase()) }))) return;
      tierRows = tierRows.filter((x) => x !== entry);
      row.remove();
    });
    const pBox = mk('div', 'affix w-num small');
    pBox.append(p, mk('span', 'unit', t('unit.kr')));
    const from = mk('span', 'twe-tier-part');
    from.append(mk('span', '', t('twe.from')), q.el, mk('span', '', t('twe.bottles')));
    const each = mk('span', 'twe-tier-part');
    each.append(pBox, mk('span', '', t('unit.each')));
    line.append(from, each);
    row.append(line, del);
    tierRows.push(entry);
    $('twe-tiers').append(row);
    return entry;
  }
  $('twe-add-tier').addEventListener('click', () => tierRow().price.focus());

  function edit(r: Row) {
    editing = r;
    const w = r.wines;
    $('twe-title').textContent = w.name;
    $('twe-thumb').replaceWith(Object.assign(wineThumb(w), { id: 'twe-thumb' }));
    $('twe-meta').textContent = meta(w);
    const price = $<HTMLInputElement>('twe-price');
    // No guest price yet: start from the shop's price (an offer on 1 bottle first) – saved when the host presses Save
    price.value = amountText(r.price_dkk ?? startPrice(w), locale());
    const retail = $<HTMLInputElement>('twe-retail-in');
    retail.value = amountText(w.retail_price_dkk, locale());
    $('twe-tiers').replaceChildren();
    tierRows = [];
    for (const x of tiersOf(r)) tierRow(x.qty, amountText(x.price, locale()));
    document.querySelectorAll<HTMLInputElement>('input[name="twe-vis"]').forEach((x) => (x.checked = x.value === visOf(r)));
    $<HTMLInputElement>('twe-orderable').checked = r.orderable;
    for (const el of [price, retail]) fieldError(el, null);
    editPanel.open();
    initHelpTips($('tw-edit'));
  }

  $<HTMLFormElement>('twe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = editing;
    if (!r) return;
    // Check: a price is a number of 0 or more; a quantity price needs both a number of bottles (2–99) and a price
    let ok = true;
    const priceEl = $<HTMLInputElement>('twe-price');
    const price = parseAmount(priceEl.value);
    if (price != null && (Number.isNaN(price) || price < 0)) { fieldError(priceEl, t('wineCheck.price')); ok = false; }
    const retailEl = $<HTMLInputElement>('twe-retail-in');
    const retail = parseAmount(retailEl.value);
    if (retail != null && (Number.isNaN(retail) || retail < 0)) { fieldError(retailEl, t('wineCheck.price')); ok = false; }
    const tiers = new Map<number, number>();
    for (const x of tierRows) {
      const q = x.qty.value, pt = x.price.value.trim();
      // A row without a price is left out (the stepper always has a number)
      if (!pt) continue;
      const p = parseAmount(pt);
      const row = x.price.closest('.twe-tier')!;
      if (p == null || Number.isNaN(p) || p < 0) { fieldError(x.price, t('wineCheck.price'), row); ok = false; continue; }
      tiers.set(q, p);
    }
    if (!ok) { $('tw-edit').querySelector<HTMLElement>('[aria-invalid]')?.focus(); return; }
    const vis = document.querySelector<HTMLInputElement>('input[name="twe-vis"]:checked')?.value ?? visOf(r);
    const patch = {
      price_dkk: price,
      price_tiers: [...tiers].sort((a, b) => a[0] - b[0]).map(([qty, p]) => ({ qty, price: p })),
      revealed: vis !== 'hidden',
      blind: vis === 'blind',
      orderable: $<HTMLInputElement>('twe-orderable').checked,
    };
    const save = $<HTMLButtonElement>('twe-save');
    save.disabled = true;
    let done = await update(r, patch);
    // The shop's price belongs to the wine (the library)
    if (done && retail !== (r.wines.retail_price_dkk ?? null)) {
      const { error } = await supabase.from('wines').update({ retail_price_dkk: retail }).eq('id', r.wine_id);
      if (error) { toast(t('admin.changeNotSaved'), { kind: 'error' }); done = false; }
      else r.wines.retail_price_dkk = retail;
    }
    save.disabled = false;
    if (!done) return;
    editPanel.close();
    render();
    toast(t('twe.saved', { name: r.wines.name }), { kind: 'ok' });
    highlight(list.querySelector(`[data-id="${r.wine_id}"]`));
  });

  // Remove from the tasting – asked first, then gone with Undo; removed for real when the toast goes (the one
  // delete with Undo, src/lib/ui/delete-undo.ts). The wine stays in the library.
  function removeWine(r: Row): Promise<boolean> {
    let index = -1;
    return deleteWithUndo({
      label: t('twe.removed', { name: r.wines.name }),
      ask: { title: t('twe.removeQ', { name: r.wines.name }), text: t('twe.removeHint'), ok: t('twe.remove') },
      hide: () => { index = rows.indexOf(r); rows = rows.filter((x) => x !== r); render(); },
      restore: () => { if (!rows.includes(r)) rows.splice(Math.max(0, index), 0, r); render(); },
      commit: async () => !(await supabase.from('tasting_wines').delete().eq('tasting_id', tastingId).eq('wine_id', r.wine_id)).error,
      keepalive: [`tasting_wines?tasting_id=eq.${tastingId}&wine_id=eq.${r.wine_id}`],
      failed: t('twe.removeFailed', { name: r.wines.name }),
    });
  }
  $('twe-remove').addEventListener('click', async () => {
    if (editing && await removeWine(editing)) editPanel.close();
  });

  function emit() {
    onChange(rows.map((r) => ({ id: r.wine_id, name: r.wines.name, price_dkk: r.price_dkk, sort_order: r.sort_order, tiers: r.price_tiers ?? [] })));
  }

  // ---------- Adding: the line above the list (wine-quick-add.ts) ----------
  /** The guest price a wine starts with: the shop's offer when it is on a single bottle, else the regular price */
  const startPrice = (w: LibWine) => (w.offer_quantity === 1 && w.offer_price_dkk != null ? Number(w.offer_price_dkk) : w.retail_price_dkk);
  /** Puts a library wine last in the tasting, with the shop's prices as a start. */
  async function addWine(w: LibWine) {
    const sort = rows.reduce((mx, r) => Math.max(mx, r.sort_order), 0) + 1;
    // Start from the regular price, and the shop's offer as quantity price when it is for several bottles
    const fromOffer = w.offer_quantity != null && w.offer_quantity >= 2 && w.offer_price_dkk != null;
    const row = {
      tasting_id: tastingId, wine_id: w.id, sort_order: sort, price_dkk: startPrice(w),
      price_tiers: fromOffer ? [{ qty: w.offer_quantity!, price: Number(w.offer_price_dkk) }] : [],
    };
    // (a blind tasting makes the new wine blind; the answer says so)
    const { data: saved, error } = await supabase.from('tasting_wines').insert(row).select('orderable, revealed, blind').single();
    if (error || !saved) { toast(t('admin.changeNotSaved'), { kind: 'error' }); return false; }
    rows.push({ ...row, ...(saved as { orderable: boolean; revealed: boolean; blind: boolean }), wines: w });
    render();
    highlight(list.querySelector(`[data-id="${w.id}"]`));
    toast(t('adminTasting.wineAdded', { name: [w.name, w.vintage].filter(Boolean).join(' ') }), { kind: 'ok' });
    return true;
  }
  const quick = initQuickAdd({
    hostId,
    toggle: $('tw-add-toggle'),
    library: () => library,
    inHere: () => new Set(rows.map((r) => r.wine_id)),
    pick: (w) => addWine(w as LibWine),
    href: (w) => wineHref(w.id),
    // A new wine goes into the tasting as soon as it is saved – the card goes on showing what comes in
    saved: async (id) => {
      const { data } = await supabase.from('wines').select(COLS).eq('id', id).single();
      if (!data) return;
      const w = data as LibWine;
      library.push(w);
      const sort = rows.reduce((mx, r) => Math.max(mx, r.sort_order), 0) + 1;
      const fromOffer = w.offer_quantity != null && w.offer_quantity >= 2 && w.offer_price_dkk != null;
      await supabase.from('tasting_wines').insert({ tasting_id: tastingId, wine_id: id, sort_order: sort, price_dkk: startPrice(w),
        price_tiers: fromOffer ? [{ qty: w.offer_quantity!, price: Number(w.offer_price_dkk) }] : [] });
    },
    done: async (id, name) => {
      await load();
      highlight(list.querySelector(`[data-id="${id}"]`));
      toast(t('adminTasting.wineAdded', { name }), { kind: 'ok', action: { label: t('wineLib.open'), href: wineHref(id) } });
    },
  });
  // The empty tasting's button opens the same new-wine line
  $('tw-empty-add').addEventListener('click', () => quick.open());

  async function load() {
    const [tw, lib, r] = await Promise.all([
      supabase.from('tasting_wines').select(`wine_id, sort_order, price_dkk, price_tiers, orderable, revealed, blind, wines(${COLS})`)
        .eq('tasting_id', tastingId).order('sort_order'),
      supabase.from('wines').select(COLS).eq('tenant_id', tenantId).order('name'),
      supabase.rpc('tasting_wine_ratings', { t_id: tastingId }),
    ]);
    rows = (tw.data ?? []) as unknown as Row[];
    library = (lib.data ?? []) as LibWine[];
    ratings = new Map(((r.data ?? []) as { wine_id: number; average: number; votes: number }[])
      .map((x) => [x.wine_id, { average: Number(x.average), votes: x.votes }]));
    render();
    // No wines yet: the line is open, ready for the first one
    if (!rows.length && !quick.isOpen()) quick.open(false);
    // ?edit=<wine id> (from the wine library): open that wine's panel
    const want = Number(new URLSearchParams(location.search).get('edit'));
    const hit = want ? rows.find((x) => x.wine_id === want) : null;
    if (hit) {
      const u = new URL(location.href); u.searchParams.delete('edit'); history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      edit(hit);
    }
  }

  return { load };
}

