// "New wine" as one line above a wine list (WineQuickAdd.astro): type a name – it is looked up in the library –
// paste a link from a web shop, or add a photo of the label. A link or a photo is read straight away; a card above
// the list shows what comes in (name, type, origin, price, the producer), and when it is done the wine moves into
// the list. Used on the wine library and on a tasting's Wines tab (where a wine also goes into the tasting).
import { knownProducer, shareProducer } from './producers';
import { formatKr } from './ui/kr';
import { setLoading } from './ui/button';
import { supabase } from './supabase';
import { $, mk } from './ui/dom';
import { closeButton } from './ui/icon-button';
import { STYLES, styleName, withoutYear } from './wines';
import { t, lang } from '../i18n';
import { WINE_COUNTRIES, normOrigin, originLine } from './origin';
import { shrinkImage, labelDataUrl, locateAppellation, type LabelResult, type LinkResult } from './wine-read';
import { attachImageInput } from './ui/image-picker';
import { addRow, hitButton, type Hit } from './ui/add-row';
import { listRow } from './ui/list-row';
import { wineThumb, setThumb } from './ui/thumb';
import { setStatus, statusLine, type StatusState } from './ui/status-line';

export type QuickWine = { id: number; name: string; producer: string | null; vintage: string | null; style: string | null;
  image_url: string | null; source_url?: string | null };

type Opts = {
  hostId: string;
  /** The account the new wines go into (the one the admin shows) */
  tenantId: string;
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
/** "Barolo San Giovanni 2019" → name and vintage; a name without a year has no vintage. */
export function splitYear(text: string): { name: string; vintage: string | null } {
  // A year standing on its own anywhere in the name ("… Vigna Rocche 2013 Magnum") is the vintage
  const m = text.trim().match(/(^|[\s,–—-])((?:19|20)\d{2})(?=$|[\s,–—-])/);
  if (!m) return { name: text.trim(), vintage: null };
  const name = text.replace(m[0], m[1] ? ' ' : '').replace(/\s{2,}/g, ' ').replace(/^[\s,–—-]+|[\s,–—-]+$/g, '').trim();
  return name.length >= 2 ? { name, vintage: m[2] } : { name: text.trim(), vintage: null };
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
  const input = $<HTMLInputElement>('qa-input');
  const jobs = $<HTMLUListElement>('qa-jobs');
  const attached = $('qa-attached');
  const lead = !!$('qa-row').querySelector('.grip.blank');
  // A link or photo that could not be read: kept here while the host types the name
  let carry: Source | null = null;

  // The one add row (src/lib/ui/add-row.ts): opens with the page's button, Esc and × close (asked first with text)
  const row = addRow({
    id: 'qa', button: o.toggle as HTMLButtonElement, fields: [input], go: $<HTMLButtonElement>('qa-go'),
    onSubmit: () => submit(), onInput: () => renderHits(), dirty: () => !!carry,
    onClose: () => setCarry(null),
  });
  const { open, isOpen } = row;
  const bar = row.bar;

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

  function renderHits(list?: QuickWine[], head?: string) {
    const text = input.value.trim();
    const found = list ?? (asLink(text) || carry ? [] : matchesOf(text));
    // The one menu's look (components.css): a heading, then a row per wine with its own button
    const here = o.inHere?.() ?? new Set<number>();
    row.setHits(found.map((w): Hit => {
      const name = mk('a', 'opt-name', w.name);
      name.href = o.href(w);
      let action: Node;
      // The same button as "Add", disabled ("✓ In the tasting") when the wine is already in the tasting
      if (o.pick) action = hitButton(t('admin.add'), (b) => pickWine(w, b), here.has(w.id));
      else { const a = mk('a', 'text-btn', t('wineLib.open')); a.href = o.href(w); action = a; }
      return { lead: wineThumb(w, { size: 'small' }), title: name, sub: metaOf(w) || null, action };
    }), head ?? t(o.pick ? 'qa.fromLibrary' : 'qa.inLibrary'));
  }
  async function pickWine(w: QuickWine, btn?: HTMLButtonElement) {
    if (!o.pick) return;
    if (btn) setLoading(btn, true);
    const ok = await o.pick(w);
    if (btn) setLoading(btn, false);
    if (!ok) return;
    input.value = '';
    renderHits();
    if (matchMedia('(min-width: 48rem)').matches) input.focus();
  }

  function submit() {
    const text = input.value.trim();
    if (carry) {
      if (!text) { row.error(input, t('qa.nameMissing')); input.focus(); return; }
      start(carry, text);
      setCarry(null);
      input.value = '';
      return;
    }
    if (!text) { row.error(input, t('qa.empty')); input.focus(); return; }
    const url = asLink(text);
    if (url) {
      // A link the library already has: show that wine instead of a second copy
      const known = o.library().filter((w) => w.source_url && w.source_url.replace(/\/$/, '') === url.replace(/\/$/, ''));
      if (known.length) { renderHits(known, t('qa.linkKnown')); return; }
      start({ kind: 'link', url });
    } else {
      // The same wine twice is not allowed: a name without a year matches the name in any vintage,
      // "Barolo 2019" only that vintage. Tasting: the library wine is what was meant; library: show it.
      const typed = splitYear(text);
      const same = o.library().filter((w) => norm(w.name) === norm(typed.name) && (!typed.vintage || (w.vintage ?? '') === typed.vintage));
      if (same.length) {
        const free = same.filter((w) => !o.inHere?.().has(w.id));
        if (o.pick && free.length === 1 && same.length === 1) { pickWine(free[0]); return; }
        renderHits(same, t(o.pick && !free.length ? 'qa.nameHere' : 'qa.nameKnown'));
        return;
      }
      start({ kind: 'name' }, text);
    }
    input.value = '';
    renderHits();
  }

  // ---------- A photo: the button, dropped on the line, or pasted ----------
  async function photo(f: File | undefined) {
    if (!f || !f.type.startsWith('image/')) return;
    const blob = await shrinkImage(f);
    start({ kind: 'photo', blob, preview: URL.createObjectURL(blob) });
  }
  // The image picker's button, drop on the row and paste in the field (src/lib/ui/image-picker.ts)
  attachImageInput({
    button: $('qa-photo'), drop: bar, paste: input,
    onFile: (f) => photo(f),
    onError: (m) => row.error(input, m),
  });

  // ---------- The card: what comes in ----------
  // The same row as the list's (src/lib/ui/list-row.ts); the tasting's list has a grip and a number first: kept (empty)
  function card(src: Source, name?: string): HTMLLIElement {
    const source = mk('p', 'lmeta qa-src', src.kind === 'link' ? site(src.url) : src.kind === 'photo' ? t('qa.photo') : '');
    source.hidden = src.kind === 'name';
    const li = listRow({
      grip: lead ? 'blank' : undefined, no: lead ? '' : undefined,
      pic: wineThumb(src.kind === 'photo' ? src.preview : null),
      // Until the name is read: a quiet "New wine" – the status line below shows that it is being fetched
      title: name ?? t('qa.unnamed'),
      body: [source, mk('div', 'qa-facts'), statusLine()],
    });
    if (!name) li.querySelector('.ltitle')!.classList.add('unnamed');
    li.append(mk('div', 'lacts'));
    jobs.prepend(li);
    return li;
  }
  const part = (li: HTMLElement) => ({
    pic: li.querySelector<HTMLElement>('.thumb')!,
    title: li.querySelector<HTMLElement>('.ltitle')!,
    facts: li.querySelector<HTMLElement>('.qa-facts')!,
    status: li.querySelector<HTMLElement>('.lbody > .status')!,
    actions: li.querySelector<HTMLElement>(':scope > .lacts')!,
  });
  function say(li: HTMLElement, text: string, kind: StatusState | '' = '') {
    setStatus(part(li).status, kind || 'info', text);
  }
  function fact(li: HTMLElement, text: string | null) {
    if (text) part(li).facts.append(mk('p', 'lmeta', text));
  }
  function buttons(li: HTMLElement, ...list: [string, () => void, string?][]) {
    const box = part(li).actions;
    box.replaceChildren(...list.map(([label, run, cls]) => {
      const b = label === '×' ? closeButton(t('qa.dismiss'), 'small') : mk('button', cls ?? 'btn small secondary', label);
      if (label === '×') b.dataset.tip = t('qa.dismiss');
      b.type = 'button';
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
    // A typed name may end in its year ("Barolo 2019")
    const typed = job.name ? splitYear(job.name) : null;
    const vintage = r.vintage?.trim() || typed?.vintage || null;
    const name = withoutYear((typed?.name ?? r.name ?? '').trim(), vintage ?? '')?.trim() ?? '';
    if (!name) { failed(job, t(src.kind === 'link' ? 'qa.linkNoName' : 'qa.labelNoName')); return; }

    // What came in
    const style = r.style && (STYLES as readonly string[]).includes(r.style) ? r.style : null;
    const country = r.country && WINE_COUNTRIES.includes(r.country) ? r.country : null;
    p.title.textContent = [name, vintage].filter(Boolean).join(' ');
    p.title.classList.remove('unnamed');
    if (r.image && src.kind === 'link') setThumb(p.pic, r.image);
    fact(li, metaOf({ style, vintage, producer: r.producer ?? null }) || null);
    fact(li, originLine({ appellation: r.appellation ?? null, region: r.region ?? null, country }));
    if (r.price != null) fact(li, t('qa.price', { price: formatKr(r.price) }));

    // The same wine is in the library already (same name and vintage): use that one
    const twin = o.library().find((w) => norm(w.name) === norm(name) && (w.vintage ?? '') === (vintage ?? ''));
    if (twin) {
      // Never the same wine twice: offer the one in the library instead
      const here = !!o.inHere?.().has(twin.id);
      say(li, t(here ? 'qa.twinHere' : 'qa.twin'), 'warn');
      const actions: [string, () => void, string?][] = [];
      if (o.pick && !here) actions.push([t('qa.useTwin'), async () => { if (await o.pick!(twin)) drop(li); }]);
      else if (!o.pick) actions.push([t('wineLib.open'), () => { location.href = o.href(twin); }]);
      actions.push(['×', () => drop(li)]);
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
      host_id: o.hostId, tenant_id: o.tenantId, name, vintage, style, country,
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
      buttons(li, [t('qa.retry'), () => save(job, r, name, vintage, style, country)], ['×', () => drop(li)]);
      return;
    }
    await o.saved?.(id);
    locateAppellation(row.appellation, row.region, row.country);

    // 3. The producer's website and place (as the wine form does)
    if (row.producer) {
      say(li, t('qa.findingProducer', { producer: row.producer }), 'busy');
      try {
        // What another host has already found for the producer comes first; else the producer's own website
        const known = await knownProducer(row.producer);
        const f = known && (known.website || known.lat != null)
          ? { website: known.website, address: known.address, location: known.lat != null && known.lon != null ? { lat: known.lat, lon: known.lon, source: known.source ?? 'shared' } : null }
          : await post<{ website: string | null; address: string | null; location: { lat: number; lon: number; source: string } | null }>(
            '/api/find-producer', { producer: row.producer, wine: name, appellation: row.appellation, region: row.region, country: row.country, website: null });
        await supabase.from('wines').update({
          producer_website: f.website, producer_address: f.address,
          producer_lat: f.location?.lat ?? null, producer_lon: f.location?.lon ?? null,
          producer_source: f.location ? f.location.source : 'none', producer_checked_at: new Date().toISOString(),
        }).eq('id', id);
        await shareProducer(row.producer, { website: f.website, address: f.address, lat: f.location?.lat ?? null, lon: f.location?.lon ?? null, source: f.location?.source ?? null }, id);
        if (f.website || f.address) fact(li, t('qa.producerFound', { what: [f.website ? site(f.website) : null, f.address].filter(Boolean).join(' · ') }));
      } catch { /* the wine form looks again when the wine is opened */ }
    }
    say(li, t('qa.saved'), 'ok');
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
      ['×', () => drop(job.li)]);
  }

  return { open, isOpen };
}
