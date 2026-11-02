// Create or set up a tasting in four steps: details, wines, guests, payment & setup.
// Step 1 creates the tasting; every later step saves straight away, so the host can stop at any point.
import { supabase } from './supabase';
import { t, locale, type Key } from '../i18n';
import { amountText } from './wine-validate';
import { $, mk, toNumber, type Host } from './admin-common';
import { initAddress, readAddress, writeAddress } from './address';
import { initWhen, readWhen, readEnd, writeWhen, futureOnly, checkWhen } from './datetime';
import { fieldError, focusField } from './field-error';

type Tasting = { id: string; slug: string } & Record<string, unknown>;
type LibWine = { id: number; name: string; producer: string | null; vintage: string | null; image_url: string | null;
  retail_price_dkk: number | null; offer_price_dkk: number | null; offer_quantity: number | null };
type LibGuest = { id: string; name: string; email: string | null };

const NEXT: Key[] = ['wizard.nextWines', 'wizard.nextGuests', 'wizard.nextSetup', 'wizard.done'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function initWizard(host: Host, onClose: (slug: string | null) => void) {
  const dialog = $<HTMLDialogElement>('wizard');
  let tasting: Tasting | null = null;
  let step = 0;
  let wines: LibWine[] = [];
  let guests: LibGuest[] = [];
  const winesIn = new Set<number>();      // already in the tasting
  const guestsIn = new Set<string>();     // already invited
  const pickedWines = new Set<number>();
  const pickedGuests = new Set<string>();

  initAddress('wz');
  initWhen('wz');
  const val = (id: string) => $<HTMLInputElement>(id).value;

  // The footer message is for what is not about one field (e.g. "could not be saved"); it goes when anything is changed
  function msg(text = '') { $('wz-msg').textContent = text; $('wz-msg').hidden = !text; }
  dialog.addEventListener('input', () => msg());
  dialog.addEventListener('change', () => msg());

  // What each step looked like when shown, to know whether closing would lose something
  const paneValues = (i: number) => JSON.stringify([...dialog.querySelectorAll<HTMLInputElement>(`.wz-pane[data-pane="${i}"] input:not([type=search]), .wz-pane[data-pane="${i}"] textarea`)]
    .filter((x) => !x.closest('#wz-new-guest')).map((x) => (x.type === 'checkbox' || x.type === 'radio' ? x.checked : x.value)));
  let shownAs = '';
  const changed = () => paneValues(step) !== shownAs || (step === 1 && pickedWines.size > 0) || (step === 2 && pickedGuests.size > 0);
  function showSaved() {
    $('wz-saved').hidden = !tasting;
    $('wz-draft-note').hidden = !!tasting;
  }

  function show(i: number) {
    step = i;
    dialog.querySelectorAll<HTMLElement>('.wz-pane').forEach((p) => (p.hidden = Number(p.dataset.pane) !== i));
    dialog.querySelectorAll<HTMLButtonElement>('.wz-step').forEach((b, n) => {
      b.classList.toggle('current', n === i);
      b.classList.toggle('done', !!tasting && n < i);
      b.disabled = !tasting && n > 0;      // steps 2–4 need the tasting from step 1
      if (n === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    $('wz-back').hidden = i === 0;
    $('wz-next').textContent = t(NEXT[i]);
    // Step 1 of a new tasting: "save and close" creates it; later it just closes after saving
    $('wz-save').textContent = t(!tasting && i === 0 ? 'wizard.createClose' : 'wizard.saveClose');
    $('wz-save').hidden = i === 3;
    msg();
    showSaved();
    leaving(false);
    shownAs = paneValues(i);
    dialog.querySelector('.wz-body')!.scrollTop = 0;
    dialog.querySelector('.wz-steps .current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---------- Step 1: details ----------
  function fillDetails() {
    $<HTMLInputElement>('wz-title-input').value = (tasting?.title as string) ?? '';
    writeWhen('wz', tasting?.starts_at, tasting?.ends_at);
    futureOnly('wz', !tasting);
    $<HTMLInputElement>('wz-max').value = tasting?.max_guests ? String(tasting.max_guests) : '';
    for (const id of ['wz-title-input', 'wz-date-show', 'wz-time', 'wz-end', 'wz-max', 'wz-fee']) fieldError($(id), null);
    $<HTMLTextAreaElement>('wz-intro').value = (tasting?.intro as string) ?? '';
    writeAddress('wz', (tasting ?? {}) as Record<string, string | null>);
  }

  async function saveDetails(): Promise<boolean> {
    const title = val('wz-title-input').trim();
    // Errors under the fields; the first one gets the focus
    if (!title) fieldError($('wz-title-input'), t('admin.titleMissing'));
    // A new tasting is held from now on
    const whenOk = checkWhen('wz', !tasting);
    const maxText = val('wz-max').trim();
    const max = maxText ? Number(maxText) : null;
    const maxOk = max == null || (Number.isInteger(max) && max >= 1 && max <= 10000);
    if (!maxOk) fieldError($('wz-max'), t('wizard.maxBad'));
    if (!title || !whenOk || !maxOk) {
      const bad = dialog.querySelector<HTMLElement>('.wz-pane[data-pane="0"] [aria-invalid]');
      if (bad) focusField(bad);
      return false;
    }
    const fields = {
      starts_at: readWhen('wz'),
      ends_at: readEnd('wz'),
      max_guests: max,
      ...readAddress('wz'),
    };
    const intro = $<HTMLTextAreaElement>('wz-intro').value.trim() || null;
    if (!tasting) {
      const { ends_at: _e, max_guests: _m, ...create } = fields;
      const { data, error } = await supabase.rpc('create_tasting', { title, place: null, mobilepay: null, ...create });
      if (error || !data) { msg(t('admin.createFailed')); return false; }
      tasting = data as Tasting;
      const extra = { ...(intro ? { intro } : {}), ...(fields.ends_at ? { ends_at: fields.ends_at } : {}), ...(max ? { max_guests: max } : {}) };
      if (Object.keys(extra).length) await supabase.from('tastings').update(extra).eq('id', tasting.id);
      $('wz-title').textContent = title;
    } else {
      const { error } = await supabase.from('tastings').update({ title, intro, ...fields }).eq('id', tasting.id);
      if (error) { msg(t('admin.changesNotSaved')); return false; }
    }
    Object.assign(tasting, { title, intro, ...fields });
    return true;
  }

  // ---------- Step 2: wines ----------
  function renderWines() {
    const q = val('wz-wine-search').trim().toLowerCase();
    $('wz-wines-empty').hidden = wines.length > 0;
    $('wz-wine-search').hidden = wines.length < 6;
    $('wz-wines').replaceChildren(...wines
      .filter((w) => !q || `${w.name} ${w.producer ?? ''} ${w.vintage ?? ''}`.toLowerCase().includes(q))
      .map((w) => {
        const li = mk('li');
        const label = mk('label', 'wz-item');
        const box = mk('input');
        box.type = 'checkbox';
        box.checked = winesIn.has(w.id) || pickedWines.has(w.id);
        box.disabled = winesIn.has(w.id);
        box.addEventListener('change', () => { if (box.checked) pickedWines.add(w.id); else pickedWines.delete(w.id); });
        const thumb = mk('span', 'wz-thumb');
        if (w.image_url) { const img = mk('img'); img.src = w.image_url; img.alt = ''; img.loading = 'lazy'; thumb.append(img); }
        const text = mk('span', 'wz-text');
        text.append(mk('b', '', w.name));
        const meta = [w.producer, w.vintage].filter(Boolean).join(' · ');
        if (meta || winesIn.has(w.id)) text.append(mk('small', '', [meta, winesIn.has(w.id) ? t('wizard.alreadyIn') : ''].filter(Boolean).join(' · ')));
        label.append(box, thumb, text);
        li.append(label);
        return li;
      }));
  }

  async function saveWines(): Promise<boolean> {
    const add = wines.filter((w) => pickedWines.has(w.id) && !winesIn.has(w.id));
    if (!add.length) return true;
    const { data: cur } = await supabase.from('tasting_wines').select('sort_order').eq('tasting_id', tasting!.id);
    let sort = (cur ?? []).reduce((mx, r) => Math.max(mx, r.sort_order as number), 0);
    // Same start as the picker in the tasting: regular price, and the shop offer as quantity price
    const rows = add.map((w) => {
      const fromOffer = w.offer_quantity != null && w.offer_quantity >= 2 && w.offer_price_dkk != null;
      return { tasting_id: tasting!.id, wine_id: w.id, sort_order: ++sort, price_dkk: w.retail_price_dkk,
        price_tiers: fromOffer ? [{ qty: w.offer_quantity!, price: Number(w.offer_price_dkk) }] : [] };
    });
    const { error } = await supabase.from('tasting_wines').insert(rows);
    if (error) { msg(t('admin.changeNotSaved')); return false; }
    add.forEach((w) => { winesIn.add(w.id); pickedWines.delete(w.id); });
    return true;
  }

  // ---------- Step 3: guests ----------
  /** The guests the search shows. */
  const visibleGuests = () => {
    const q = val('wz-guest-search').trim().toLowerCase();
    return guests.filter((g) => !q || `${g.name} ${g.email ?? ''}`.toLowerCase().includes(q));
  };
  function syncAll() {
    const open = visibleGuests().filter((g) => !guestsIn.has(g.id));
    const all = $<HTMLInputElement>('wz-all');
    $('wz-all-box').hidden = open.length < 2;
    all.checked = open.length > 0 && open.every((g) => pickedGuests.has(g.id));
    all.indeterminate = !all.checked && open.some((g) => pickedGuests.has(g.id));
  }
  // "Select all": the guests shown by the search who are not invited yet
  $('wz-all').addEventListener('change', () => {
    const on = $<HTMLInputElement>('wz-all').checked;
    for (const g of visibleGuests()) if (!guestsIn.has(g.id)) { if (on) pickedGuests.add(g.id); else pickedGuests.delete(g.id); }
    renderGuests();
  });
  function renderGuests() {
    $('wz-guest-search').hidden = guests.length < 6;
    syncAll();
    $('wz-guests').replaceChildren(...visibleGuests()
      .map((g) => {
        const li = mk('li');
        const label = mk('label', 'wz-item');
        const box = mk('input');
        box.type = 'checkbox';
        box.checked = guestsIn.has(g.id) || pickedGuests.has(g.id);
        box.disabled = guestsIn.has(g.id);
        box.addEventListener('change', () => { if (box.checked) pickedGuests.add(g.id); else pickedGuests.delete(g.id); syncAll(); });
        const text = mk('span', 'wz-text');
        text.append(mk('b', '', g.name));
        const meta = [g.email, guestsIn.has(g.id) ? t('wizard.alreadyInvited') : ''].filter(Boolean).join(' · ');
        if (meta) text.append(mk('small', '', meta));
        label.append(box, text);
        li.append(label);
        return li;
      }));
  }

  async function saveGuests(): Promise<boolean> {
    const add = guests.filter((g) => pickedGuests.has(g.id) && !guestsIn.has(g.id));
    if (!add.length) return true;
    const { error } = await supabase.from('participants')
      .insert(add.map((g) => ({ tasting_id: tasting!.id, guest_id: g.id, name: g.name, email: g.email })));
    if (error) { msg(error.code === '23505' ? t('guest.emailTaken') : t('admin.guestNotAdded')); return false; }
    add.forEach((g) => { guestsIn.add(g.id); pickedGuests.delete(g.id); });
    return true;
  }

  // A new guest goes into the guest library and is ticked
  $('wz-new-guest').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = val('wz-guest-name').trim();
    const email = val('wz-guest-email').trim().toLowerCase() || null;
    const m = $('wz-guest-msg');
    m.hidden = true;
    if (!name) { fieldError($('wz-guest-name'), t('wizard.guestNameMissing'), $('wz-new-guest').querySelector('.wz-pair')!); focusField($('wz-guest-name')); return; }
    if (email && !EMAIL_RE.test(email)) { fieldError($('wz-guest-email'), t('guest.emailBad'), $('wz-new-guest').querySelector('.wz-pair')!); focusField($('wz-guest-email')); return; }
    const existing = email ? guests.find((g) => g.email?.toLowerCase() === email) : null;
    let g = existing ?? null;
    if (!g) {
      const { data, error } = await supabase.from('guests').insert({ host_id: host.id, name, email }).select('id, name, email').single();
      if (error || !data) { m.textContent = error?.code === '23505' ? t('guestLib.emailTaken') : t('admin.guestNotAdded'); m.hidden = false; m.scrollIntoView({ block: 'center' }); return; }
      g = data as LibGuest;
      guests.push(g);
      guests.sort((a, b) => a.name.localeCompare(b.name));
    }
    pickedGuests.add(g.id);
    (e.target as HTMLFormElement).reset();
    renderGuests();
    $('wz-guest-name').focus();
  });

  // ---------- Step 4: payment & setup ----------
  // Fee: "No" hides the amount; "Yes" shows it (an amount already set means yes)
  function showFee(yes: boolean) {
    $('wz-fee-box').hidden = !yes;
    dialog.querySelectorAll<HTMLInputElement>('input[name="wz-fee-yes"]').forEach((r) => (r.checked = r.value === (yes ? 'yes' : 'no')));
  }
  dialog.querySelectorAll<HTMLInputElement>('input[name="wz-fee-yes"]').forEach((r) =>
    r.addEventListener('change', () => { showFee(r.value === 'yes'); if (r.value === 'yes') $('wz-fee').focus(); }));

  // Ordering on: the host chooses what counts towards quantity prices
  $('wz-orders').addEventListener('change', () => { $('wz-bulk').hidden = !$<HTMLInputElement>('wz-orders').checked; });

  function fillSetup() {
    const fee = Number(tasting?.tasting_fee) || 0;
    $<HTMLInputElement>('wz-fee').value = fee ? amountText(fee, locale()) : '';
    showFee(fee > 0 || tasting?.tasting_fee_open === true);
    $<HTMLInputElement>('wz-fee-open').checked = tasting?.tasting_fee_open === true;
    $<HTMLInputElement>('wz-signup').checked = tasting?.signup_open !== false;
    $<HTMLInputElement>('wz-orders').checked = tasting?.orders_open === true;
    $<HTMLInputElement>('wz-blind').checked = tasting?.blind === true;
    dialog.querySelectorAll<HTMLInputElement>('input[name="wz-bulk"]').forEach((r) => (r.checked = r.value === tasting?.bulk_mode));
    $('wz-bulk').hidden = !$<HTMLInputElement>('wz-orders').checked;
    const mp = $('wz-mp');
    mp.replaceChildren();
    if (host.mobilepay) mp.textContent = t('wizard.mpSet', { number: host.mobilepay.replace(/(\d{2})(?=\d)/g, '$1 ') });
    else mp.innerHTML = t('wizard.mpMissing');
  }

  async function saveSetup(): Promise<boolean> {
    const paying = !$('wz-fee-box').hidden;
    const feeText = val('wz-fee').trim();
    const fee = paying ? toNumber(feeText) : 0;
    if (paying && feeText && (fee == null || fee < 0 || fee > 100000)) {
      fieldError($('wz-fee'), t('wizard.feeBad'));
      focusField($('wz-fee'));
      return false;
    }
    const patch = {
      tasting_fee: fee ?? 0,
      tasting_fee_open: paying && $<HTMLInputElement>('wz-fee-open').checked,
      signup_open: $<HTMLInputElement>('wz-signup').checked,
      orders_open: $<HTMLInputElement>('wz-orders').checked,
      blind: $<HTMLInputElement>('wz-blind').checked,
      ...(() => { const b = dialog.querySelector<HTMLInputElement>('input[name="wz-bulk"]:checked'); return b ? { bulk_mode: b.value } : {}; })(),
    };
    const { error } = await supabase.from('tastings').update(patch).eq('id', tasting!.id);
    if (error) { msg(t(error.message.includes('bulk_mode_needed') ? 'bulk.chooseFirst' : 'admin.changesNotSaved')); return false; }
    Object.assign(tasting!, patch);
    return true;
  }

  const SAVE = [saveDetails, saveWines, saveGuests, saveSetup];

  async function busy<T>(btn: HTMLButtonElement, fn: () => Promise<T>) {
    btn.disabled = true;
    btn.classList.add('loading');
    try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('loading'); }
  }

  async function loadLibraries() {
    const [w, g, tw, p] = await Promise.all([
      supabase.from('wines').select('id, name, producer, vintage, image_url, retail_price_dkk, offer_price_dkk, offer_quantity').eq('tenant_id', host.tenant_id).order('name'),
      supabase.from('guests').select('id, name, email').eq('tenant_id', host.tenant_id).order('name'),
      tasting ? supabase.from('tasting_wines').select('wine_id').eq('tasting_id', tasting.id) : Promise.resolve({ data: [] }),
      tasting ? supabase.from('participants').select('guest_id').eq('tasting_id', tasting.id) : Promise.resolve({ data: [] }),
    ]);
    wines = (w.data ?? []) as LibWine[];
    guests = (g.data ?? []) as LibGuest[];
    winesIn.clear(); guestsIn.clear(); pickedWines.clear(); pickedGuests.clear();
    for (const r of (tw.data ?? []) as { wine_id: number }[]) winesIn.add(r.wine_id);
    for (const r of (p.data ?? []) as { guest_id: string | null }[]) if (r.guest_id) guestsIn.add(r.guest_id);
    renderWines();
    renderGuests();
  }

  function close() {
    if (dialog.open) dialog.close();
  }
  /** The question in the footer when closing would lose what was changed on this step. */
  function leaving(on: boolean) {
    $('wz-leave').hidden = !on;
    $('wz-actions').hidden = on;
    if (on) $('wz-leave-stay').focus();
  }
  function requestClose() {
    if (!$('wz-leave').hidden) { close(); return; } // asked already: a second Esc closes
    if (changed()) leaving(true); else close();
  }
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); requestClose(); });
  $('wz-leave-save').addEventListener('click', (e) => { leaving(false); go('close', e.currentTarget as HTMLButtonElement); });
  $('wz-leave-drop').addEventListener('click', () => close());
  $('wz-leave-stay').addEventListener('click', () => leaving(false));
  dialog.addEventListener('close', () => onClose(tasting?.slug ?? null));

  // Save the current step, then go to another (or close)
  async function go(to: number | 'close', btn: HTMLButtonElement) {
    const ok = await busy(btn, () => SAVE[step]());
    if (!ok) return;
    if (to === 'close' || to > 3) close(); else show(to);
  }

  $('wz-next').addEventListener('click', (e) => go(step + 1, e.currentTarget as HTMLButtonElement));
  $('wz-save').addEventListener('click', (e) => go('close', e.currentTarget as HTMLButtonElement));
  $('wz-back').addEventListener('click', (e) => go(step - 1, e.currentTarget as HTMLButtonElement));
  $('wz-close').addEventListener('click', requestClose);
  // A new wine from the wine step: the wine guide puts it in the library and the tasting, then comes back here
  $('wz-new-wine').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!tasting || !(await saveWines())) return;
    const back = `/t/${tasting.slug}/admin/?wizard=1`;
    location.href = `/admin/wines/?new=${tasting.id}&back=${encodeURIComponent(back)}`;
  });
  dialog.querySelectorAll<HTMLButtonElement>('.wz-step').forEach((b) =>
    b.addEventListener('click', () => { const to = Number(b.dataset.step); if (to !== step) go(to, b); }));
  $('wz-wine-search').addEventListener('input', renderWines);
  $('wz-guest-search').addEventListener('input', renderGuests);

  async function open(existing: Tasting | null, at = 0) {
    tasting = existing ? { ...existing } : null;
    $('wz-title').textContent = existing ? (existing.title as string) : t('admin.newTasting');
    fillDetails();
    fillSetup();
    show(existing ? at : 0);
    dialog.showModal();
    if (!existing && matchMedia('(min-width: 48rem)').matches) $('wz-title-input').focus();
    await loadLibraries();
  }

  return {
    openNew: () => open(null),
    openFor: (t: Tasting, at = 1) => open(t, at),
  };
}
