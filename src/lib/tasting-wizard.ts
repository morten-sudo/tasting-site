// Create or set up a tasting in four steps: details, wines, guests, payment & setup.
// Step 1 creates the tasting; every later step saves straight away, so the host can stop at any point.
import { supabase } from './supabase';
import { t, lang, type Key } from '../i18n';
import { $, mk, toNumber, type Host } from './admin-common';
import { initAddress, readAddress, writeAddress } from './address';

type Tasting = { id: string; slug: string } & Record<string, unknown>;
type LibWine = { id: number; name: string; producer: string | null; vintage: string | null; image_url: string | null;
  retail_price_dkk: number | null; offer_price_dkk: number | null; offer_quantity: number | null };
type LibGuest = { id: string; name: string; email: string | null };

const NEXT: Key[] = ['wizard.nextWines', 'wizard.nextGuests', 'wizard.nextSetup', 'wizard.done'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const pad = (n: number) => String(n).padStart(2, '0');
function toLocalInput(iso: unknown) {
  if (typeof iso !== 'string' || !iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const val = (id: string) => $<HTMLInputElement>(id).value;

  function msg(text = '') { $('wz-msg').textContent = text; $('wz-msg').hidden = !text; }

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
    dialog.querySelector('.wz-body')!.scrollTop = 0;
    dialog.querySelector('.wz-steps .current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---------- Step 1: details ----------
  function fillDetails() {
    $<HTMLInputElement>('wz-title-input').value = (tasting?.title as string) ?? '';
    $<HTMLInputElement>('wz-when').value = toLocalInput(tasting?.starts_at);
    $<HTMLTextAreaElement>('wz-intro').value = (tasting?.intro as string) ?? '';
    writeAddress('wz', (tasting ?? {}) as Record<string, string | null>);
    const l = (tasting?.language as string) ?? host.language;
    $<HTMLSelectElement>('wz-language').value = ['da', 'en', 'is'].includes(l) ? l : lang();
  }

  async function saveDetails(): Promise<boolean> {
    const title = val('wz-title-input').trim();
    if (!title) { msg(t('admin.titleMissing')); $('wz-title-input').focus(); return false; }
    const when = val('wz-when');
    const fields = {
      starts_at: when ? new Date(when).toISOString() : null,
      language: $<HTMLSelectElement>('wz-language').value,
      ...readAddress('wz'),
    };
    const intro = $<HTMLTextAreaElement>('wz-intro').value.trim() || null;
    if (!tasting) {
      const { data, error } = await supabase.rpc('create_tasting', { title, place: null, mobilepay: null, ...fields });
      if (error || !data) { msg(t('admin.createFailed')); return false; }
      tasting = data as Tasting;
      if (intro) await supabase.from('tastings').update({ intro }).eq('id', tasting.id);
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
  function renderGuests() {
    const q = val('wz-guest-search').trim().toLowerCase();
    $('wz-guest-search').hidden = guests.length < 6;
    $('wz-guests').replaceChildren(...guests
      .filter((g) => !q || `${g.name} ${g.email ?? ''}`.toLowerCase().includes(q))
      .map((g) => {
        const li = mk('li');
        const label = mk('label', 'wz-item');
        const box = mk('input');
        box.type = 'checkbox';
        box.checked = guestsIn.has(g.id) || pickedGuests.has(g.id);
        box.disabled = guestsIn.has(g.id);
        box.addEventListener('change', () => { if (box.checked) pickedGuests.add(g.id); else pickedGuests.delete(g.id); });
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
    if (!name) { $('wz-guest-name').focus(); return; }
    if (email && !EMAIL_RE.test(email)) { m.textContent = t('guest.emailBad'); m.hidden = false; return; }
    const existing = email ? guests.find((g) => g.email?.toLowerCase() === email) : null;
    let g = existing ?? null;
    if (!g) {
      const { data, error } = await supabase.from('guests').insert({ host_id: host.id, name, email }).select('id, name, email').single();
      if (error || !data) { m.textContent = error?.code === '23505' ? t('guestLib.emailTaken') : t('admin.guestNotAdded'); m.hidden = false; return; }
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
  function fillSetup() {
    const fee = Number(tasting?.tasting_fee) || 0;
    $<HTMLInputElement>('wz-fee').value = fee ? String(fee).replace('.', ',') : '';
    $<HTMLInputElement>('wz-fee-open').checked = tasting?.tasting_fee_open === true;
    $<HTMLInputElement>('wz-signup').checked = tasting?.signup_open !== false;
    $<HTMLInputElement>('wz-orders').checked = tasting?.orders_open === true;
    const mp = $('wz-mp');
    mp.replaceChildren();
    if (host.mobilepay) mp.textContent = t('wizard.mpSet', { number: host.mobilepay.replace(/(\d{2})(?=\d)/g, '$1 ') });
    else mp.innerHTML = t('wizard.mpMissing');
  }

  async function saveSetup(): Promise<boolean> {
    const fee = toNumber(val('wz-fee'));
    if (fee != null && fee < 0) { msg(t('admin.changesNotSaved')); return false; }
    const patch = {
      tasting_fee: fee ?? 0,
      tasting_fee_open: $<HTMLInputElement>('wz-fee-open').checked,
      signup_open: $<HTMLInputElement>('wz-signup').checked,
      orders_open: $<HTMLInputElement>('wz-orders').checked,
    };
    const { error } = await supabase.from('tastings').update(patch).eq('id', tasting!.id);
    if (error) { msg(t('admin.changesNotSaved')); return false; }
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
      supabase.from('wines').select('id, name, producer, vintage, image_url, retail_price_dkk, offer_price_dkk, offer_quantity').eq('host_id', host.id).order('name'),
      supabase.from('guests').select('id, name, email').eq('host_id', host.id).order('name'),
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
  $('wz-close').addEventListener('click', close);
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
