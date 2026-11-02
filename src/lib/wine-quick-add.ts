// "New wine" as one line above a wine list (WineQuickAdd.astro): type a name – it is looked up in the library –
// paste a link from a web shop, or add a photo of the label. A link or a photo is read straight away; a card above
// the list shows what comes in (name, type, origin, price, the producer), and when it is done the wine moves into
// the list. Used on the wine library and on a tasting's Wines tab (where a wine also goes into the tasting).
import { supabase } from './supabase';
import { mk } from './admin-common';
import { STYLES, styleName, withoutYear } from './wines';
import { t, lang, money } from '../i18n';
import { WINE_COUNTRIES, normOrigin, originLine } from './origin';
import { shrinkImage, labelDataUrl, locateAppellation, type LabelResult, type LinkResult } from './wine-read';
import { fieldError } from './field-error';

export type QuickWine = { id: number; name: string; producer: string | null; vintage: string | null; style: string | null;
  image_url: string | null; source_url?: string | null };

type Opts = {
  hostId: string;
  /** The "+ New wine" button: it stays where it is and opens the new row (or goes back to it). */
  toggle: HTMLElement;
  /** The host's wines, for the search. */
  library: () => QuickWine[];
  /** Tasting page: wines already in the tasting, and putting a library wine into it. */
  inHere?: () => Set<number>;
  pick?: (w: QuickWine) => Promise<boolean>;
  /** Where a library wine opens (wine library: the wine's page). */
  href: (w: QuickWine) => string;
  /** A new wine is saved (tasting page: put it in the tasting straight away). */
  saved?: (id: number) => Promise<void>;
  /** Everything has come in: show the wine in the list. */
  done: (id: number, name: string) => Promise<void>;
};

type Source = { kind: 'link'; url: string } | { kind: 'photo'; blob: Blob; preview: string } | { kind: 'name' };
type Job = { src: Source; name?: string; li: HTMLLIElement; upload?: Promise<string | null> };

const BUCKET = 'wine-images';
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

/** A web address typed or pasted (with or without https://), as https://…; else null. */
export function asLink(text: string): string | null {
  const s = text.trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^https?:\/\//i.test(s) && !/^www\./i.test(s) && !/^[\w-]+(\.[\w-]+)+\/\S*/.test(s)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.includes('.') ? u.href : null;
  } catch { return null; }
}
const site = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

async function post<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

export function initQuickAdd(o: Opts) {
  const bar = $('qa-bar');
  const input = $<HTMLInputElement>('qa-input');
  const file = $<HTMLInputElement>('qa-file');
  const hits = $<HTMLUListElement>('qa-hits');
  const jobs = $<HTMLUListElement>('qa-jobs');
  const attached = $('qa-attached');
  const go = $<HTMLButtonElement>('qa-go');
  const lead = $('qa').classList.contains('qa-lead');
  // A link or photo that could not be read: kept here while the host types the name
  let carry: Source | null = null;
  // "Create anyway" after a warning that the name is already in the library
  let confirmedName = '';

  // The new row slides in at the top of the list (.qa-slide.open); closed it is inert, so it cannot be tabbed into
  const isOpen = () => bar.classList.contains('open');
  o.toggle.setAttribute('aria-controls', 'qa-bar');
  o.toggle.setAttribute('aria-expanded', 'false');
  function open(focus = true) {
    bar.classList.add('open');
    bar.inert = false;
    o.toggle.setAttribute('aria-expanded', 'true');
    // The row is open: the button waits (grey) until the row is closed with ×
    (o.toggle as HTMLButtonElement).disabled = true;
    if (focus && matchMedia('(min-width: 48rem)').matches) input.focus({ preventScroll: true });
    if (focus) bar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function close() {
    bar.classList.remove('open');
    bar.inert = true;
    o.toggle.setAttribute('aria-expanded', 'false');
    (o.toggle as HTMLButtonElement).disabled = false;
    input.value = '';
    setCarry(null);
    fieldError(input, null);
    renderHits();
    o.toggle.focus();
  }
  o.toggle.addEventListener('click', () => open());
  $('qa-close').addEventListener('click', close);

  function setCarry(src: Source | null) {
    carry = src;
    attached.hidden = !src;
    input.placeholder = t(src ? 'qa.typeName' : 'qa.placeholder');
    if (!src) return;
    $('qa-attached-text').textContent = src.kind === 'link' ? site(src.url) : t('qa.photo');
  }
  $('qa-attached-x').addEventListener('click', () => { setCarry(null); input.focus(); });

  // ---------- The search in the library ----------
  const norm = (s: string | null | undefined) => normOrigin(s ?? '');
  function matchesOf(text: string) {
    const q = norm(text);
    if (q.length < 2) return [];
    const words = q.split(' ').filter(Boolean);
    return o.library()
      .map((w) => {
        const name = norm(w.name), all = norm(`${w.name} ${w.producer ?? ''} ${w.vintage ?? ''}`);
        const score = name === q ? 3 : name.startsWith(q) ? 2 : words.every((x) => all.includes(x)) ? 1 : 0;
        return { w, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.w.name.localeCompare(b.w.name, lang()))
      .slice(0, 5).map((x) => x.w);
  }
  const metaOf = (w: Pick<QuickWine, 'style' | 'vintage' | 'producer'>) =>
    [w.style ? styleName(w.style) : null, w.vintage, w.producer].filter(Boolean).join(' · ');

  function thumb(url: string | null) {
    const box = mk('div', 'wine-thumb');
    if (url) { const img = mk('img'); img.src = url; img.alt = ''; box.append(img); }
    return box;
  }

  function renderHits(list?: QuickWine[], head?: string) {
    const text = input.value.trim();
    const found = list ?? (asLink(text) || carry ? [] : matchesOf(text));
    hits.replaceChildren();
    hits.hidden = !found.length;
    if (!found.length) return;
    hits.append(mk('li', 'qa-hits-head', head ?? t(o.pick ? 'qa.fromLibrary' : 'qa.inLibrary')));
    const here = o.inHere?.() ?? new Set<number>();
    for (const w of found) {
      const li = mk('li', 'qa-hit');
      const body = mk('div', 'wine-body');
      const name = mk('a', 'wine-name', w.name);
      name.href = o.href(w);
      body.append(name);
      const m = metaOf(w);
      if (m) body.append(mk('p', 'wine-meta', m));
      li.append(thumb(w.image_url), body);
      if (here.has(w.id)) li.append(mk('span', 'chip', t('qa.alreadyHere')));
      else if (o.pick) {
        const add = mk('button', 'btn small ghost', t('admin.add'));
        add.type = 'button';
        add.addEventListener('click', () => pickWine(w, add));
        li.append(add);
      } else {
        const a = mk('a', 'text-btn', t('wineLib.open'));
        a.href = o.href(w);
        li.append(a);
      }
      hits.append(li);
    }
  }
  async function pickWine(w: QuickWine, btn?: HTMLButtonElement) {
    if (!o.pick) return;
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    const ok = await o.pick(w);
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    if (!ok) return;
    input.value = '';
    renderHits();
    if (matchMedia('(min-width: 48rem)').matches) input.focus();
  }

  input.addEventListener('input', () => {
    confirmedName = '';
    go.textContent = t('admin.add');
    renderHits();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      if (input.value) { input.value = ''; renderHits(); } else close();
    } else if (e.key === 'ArrowDown') {
      const first = hits.querySelector<HTMLElement>('button, a.text-btn');
      if (first) { e.preventDefault(); first.focus(); }
    }
  });
  go.addEventListener('click', submit);

  function submit() {
    const text = input.value.trim();
    if (carry) {
      if (!text) { fieldError(input, t('qa.nameMissing'), $('qa-row')); input.focus(); return; }
      start(carry, text);
      setCarry(null);
      input.value = '';
      return;
    }
    if (!text) { fieldError(input, t('qa.empty'), $('qa-row')); input.focus(); return; }
    const url = asLink(text);
    if (url) {
      // A link the library already has: show that wine instead of a second copy
      const known = o.library().filter((w) => w.source_url && w.source_url.replace(/\/$/, '') === url.replace(/\/$/, ''));
      if (known.length) { renderHits(known, t('qa.linkKnown')); return; }
      start({ kind: 'link', url });
    } else {
      const same = o.library().find((w) => norm(w.name) === norm(text));
      if (same && confirmedName !== norm(text)) {
        // Tasting: the library wine is what was meant. Library: say it exists, and let a second press create it.
        if (o.pick && !o.inHere?.().has(same.id)) { pickWine(same); return; }
        renderHits([same], t('qa.nameKnown'));
        confirmedName = norm(text);
        go.textContent = t('qa.createAnyway');
        return;
      }
      start({ kind: 'name' }, text);
    }
    input.value = '';
    confirmedName = '';
    go.textContent = t('admin.add');
    renderHits();
  }

  // ---------- A photo: the button, dropped on the line, or pasted ----------
  async function photo(f: File | undefined) {
    if (!f || !f.type.startsWith('image/')) return;
    const blob = await shrinkImage(f);
    start({ kind: 'photo', blob, preview: URL.createObjectURL(blob) });
  }
  $('qa-photo').addEventListener('click', () => file.click());
  file.addEventListener('change', () => { photo(file.files?.[0]); file.value = ''; });
  bar.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); bar.classList.add('dragging'); } });
  bar.addEventListener('dragleave', (e) => { if (!bar.contains(e.relatedTarget as Node)) bar.classList.remove('dragging'); });
  bar.addEventListener('drop', (e) => {
    bar.classList.remove('dragging');
    const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
    if (!f) return;
    e.preventDefault();
    photo(f);
  });
  input.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); photo(f); }
  });

  // ---------- The card: what comes in ----------
  function card(src: Source, name?: string): HTMLLIElement {
    const li = mk('li', 'qa-item qa-job');
    // The tasting's list has a grip and a number first: keep the columns (empty here)
    if (lead) li.append(Object.assign(mk('span', 'tw-grip qa-ghost', '⋮⋮'), { ariaHidden: 'true' }), mk('span', 'tw-no qa-plus'));
    const pic = thumb(src.kind === 'photo' ? src.preview : null);
    const body = mk('div', 'wine-body');
    const title = mk('p', 'wine-name');
    if (name) title.textContent = name;
    else title.append(mk('span', 'qa-ph'));
    const source = mk('p', 'wine-meta qa-src', src.kind === 'link' ? site(src.url) : src.kind === 'photo' ? t('qa.photo') : '');
    source.hidden = src.kind === 'name';
    const facts = mk('div', 'qa-facts');
    const status = mk('p', 'label-status');
    status.setAttribute('aria-live', 'polite');
    const actions = mk('div', 'qa-actions qa-job-actions');
    body.append(title, source, facts, status);
    li.append(pic, body, actions);
    jobs.prepend(li);
    return li;
  }
  const part = (li: HTMLElement) => ({
    pic: li.querySelector<HTMLElement>('.wine-thumb')!,
    title: li.querySelector<HTMLElement>('.wine-name')!,
    facts: li.querySelector<HTMLElement>('.qa-facts')!,
    status: li.querySelector<HTMLElement>('.label-status')!,
    actions: li.querySelector<HTMLElement>('.qa-job-actions')!,
  });
  function say(li: HTMLElement, text: string, kind: 'busy' | 'ok' | 'error' | '' = '') {
    const s = part(li).status;
    s.textContent = text;
    s.className = 'label-status' + (kind ? ' ' + kind : '');
  }
  function fact(li: HTMLElement, text: string | null) {
    if (text) part(li).facts.append(mk('p', 'wine-meta', text));
  }
  function buttons(li: HTMLElement, ...list: [string, () => void, string?][]) {
    const box = part(li).actions;
    box.replaceChildren(...list.map(([label, run, cls]) => {
      const b = mk('button', cls ?? 'btn small ghost', label);
      b.type = 'button';
      if (label === '×') b.setAttribute('aria-label', t('qa.dismiss'));
      b.addEventListener('click', run);
      return b;
    }));
  }
  function drop(li: HTMLElement) {
    li.classList.add('leaving');
    setTimeout(() => li.remove(), 300);
  }

  function start(src: Source, name?: string) {
    if (!isOpen()) open(false);
    const job: Job = { src, name, li: card(src, name) };
    // The photo goes up while the label is read
    if (src.kind === 'photo') job.upload = upload(src.blob);
    run(job);
  }

  async function upload(blob: Blob): Promise<string | null> {
    const path = `${o.hostId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    return error ? null : supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function run(job: Job) {
    const { src, li } = job;
    const p = part(li);
    p.actions.replaceChildren();
    p.facts.replaceChildren();
    // 1. Read the link or the label (not when the host typed the name after a failed reading)
    let r: Partial<LinkResult> = {};
    if (src.kind !== 'name' && !job.name) {
      say(li, src.kind === 'link' ? t('qa.readingLink', { site: site(src.url) }) : t('qa.readingLabel'), 'busy');
      try {
        r = src.kind === 'link'
          ? await post<LinkResult>('/api/read-link', { url: src.url, lang: lang() })
          : await post<LabelResult>('/api/read-label', { image: await labelDataUrl(src.blob) });
      } catch {
        failed(job, t(src.kind === 'link' ? 'qa.linkFailed' : 'qa.labelFailed'));
        return;
      }
    }
    const vintage = r.vintage?.trim() || null;
    const name = withoutYear((job.name ?? r.name ?? '').trim(), vintage ?? '')?.trim() ?? '';
    if (!name) { failed(job, t(src.kind === 'link' ? 'qa.linkNoName' : 'qa.labelNoName')); return; }

    // What came in
    const style = r.style && (STYLES as readonly string[]).includes(r.style) ? r.style : null;
    const country = r.country && WINE_COUNTRIES.includes(r.country) ? r.country : null;
    p.title.textContent = [name, vintage].filter(Boolean).join(' ');
    if (r.image && src.kind === 'link') p.pic.replaceChildren(Object.assign(mk('img'), { src: r.image, alt: '' }));
    fact(li, metaOf({ style, vintage, producer: r.producer ?? null }) || null);
    fact(li, originLine({ appellation: r.appellation ?? null, region: r.region ?? null, country }));
    if (r.price != null) fact(li, t('qa.price', { price: money(r.price) }));

    // The same wine is in the library already (same name and vintage): use that one
    const twin = o.library().find((w) => norm(w.name) === norm(name) && (w.vintage ?? '') === (vintage ?? ''));
    if (twin && src.kind !== 'name') {
      say(li, t('qa.twin'), '');
      const actions: [string, () => void, string?][] = [];
      if (o.pick && !o.inHere?.().has(twin.id)) actions.push([t('qa.useTwin'), async () => { if (await o.pick!(twin)) drop(li); }]);
      else actions.push([t('wineLib.open'), () => { location.href = o.href(twin); }]);
      actions.push([t('qa.createAnyway'), () => { job.name = name; save(job, r, name, vintage, style, country); }, 'text-btn']);
      actions.push(['×', () => drop(li), 'qa-x']);
      buttons(li, ...actions);
      return;
    }
    await save(job, r, name, vintage, style, country);
  }

  async function save(job: Job, r: Partial<LinkResult>, name: string, vintage: string | null, style: string | null, country: string | null) {
    const { src, li } = job;
    part(li).actions.replaceChildren();
    say(li, t('common.saving'), 'busy');
    // 2. Save the wine
    let image_url = src.kind === 'link' ? r.image ?? null : null;
    if (job.upload) image_url = (await job.upload) ?? null;
    const offer = r.offer && r.offer.price != null ? r.offer : null;
    const row = {
      host_id: o.hostId, name, vintage, style, country,
      producer: r.producer?.trim() || null,
      abv: typeof r.abv === 'number' ? r.abv : null,
      region: r.region?.trim() || null, appellation: r.appellation?.trim() || null,
      grapes: r.grapes?.trim() || null, description: r.description?.trim() || null,
      food_pairing: r.food?.trim() || null, serving: r.serving?.trim() || null,
      retail_price_dkk: r.price ?? null,
      offer_price_dkk: offer?.price ?? null, offer_quantity: offer && offer.quantity >= 1 && offer.quantity <= 99 ? offer.quantity : null,
      image_url,
      source_url: src.kind === 'link' ? r.source_url ?? src.url : null,
      source_fetched_at: src.kind === 'link' ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase.from('wines').insert(row).select('id').single();
    const id = (data as { id: number } | null)?.id;
    if (error || !id) {
      say(li, t('admin.wineNotSaved'), 'error');
      buttons(li, [t('qa.retry'), () => save(job, r, name, vintage, style, country)], ['×', () => drop(li), 'qa-x']);
      return;
    }
    await o.saved?.(id);
    locateAppellation(row.appellation, row.region, row.country);

    // 3. The producer's website and place (as the wine form does)
    if (row.producer) {
      say(li, t('qa.findingProducer', { producer: row.producer }), 'busy');
      try {
        const f = await post<{ website: string | null; address: string | null; location: { lat: number; lon: number; source: string } | null }>(
          '/api/find-producer', { producer: row.producer, wine: name, appellation: row.appellation, region: row.region, country: row.country, website: null });
        await supabase.from('wines').update({
          producer_website: f.website, producer_address: f.address,
          producer_lat: f.location?.lat ?? null, producer_lon: f.location?.lon ?? null,
          producer_source: f.location ? f.location.source : 'none', producer_checked_at: new Date().toISOString(),
        }).eq('id', id);
        if (f.website || f.address) fact(li, t('qa.producerFound', { what: [f.website ? site(f.website) : null, f.address].filter(Boolean).join(' · ') }));
      } catch { /* the wine form looks again when the wine is opened */ }
    }
    say(li, '✓ ' + t('qa.saved'), 'ok');
    await o.done(id, [name, vintage].filter(Boolean).join(' '));
    setTimeout(() => drop(li), 1200);
  }

  /** Reading failed or found no name: the card says so; "Type the name" keeps the link or photo for the line. */
  function failed(job: Job, text: string) {
    say(job.li, text, 'error');
    part(job.li).title.textContent = job.src.kind === 'link' ? site(job.src.url) : t('qa.photo');
    job.li.querySelector<HTMLElement>('.qa-src')!.hidden = true;
    buttons(job.li,
      [t('qa.typeNameBtn'), () => { drop(job.li); open(); setCarry(job.src); input.focus(); }],
      [t('qa.retry'), () => run(job), 'text-btn'],
      ['×', () => drop(job.li), 'qa-x']);
  }

  return { open, isOpen };
}
