// The guest's home page (/home/): the next tasting large, what is waiting for the guest, the wine book in short
// (numbers and favourites), where the wines come from, and the tastings they have been to as memories.
// Everything comes from the guest's own calls (invite codes and the signed-in email) – nothing new in the database.
import { supabase } from './supabase';
import { getCodes, tastingUrl, chatSeenKey, type MyTasting } from './guest';
import { tastingCard } from './my-tastings';
import { loadOrders, type OrderLine } from './my-orders';
import { wineItem, type BookWine } from './wine-book';
import { placeOf, loadOverview, overviewFor, focusFor, drawOverview, loadTowns, type Place } from './overview-map';
import { OVERVIEW_SOURCES, setMapCredit } from './wine-map';
import { winesBackground } from './ui/map-background';
import { mapZoom } from './ui/map-zoom';
import { countdown } from './ui/ago';
import { statusChip, guestStatus, chip } from './ui/status';
import { listRow } from './ui/list-row';
import { formatKr } from './ui/kr';
import { iconSvg } from './ui/icons';
import { $, mk } from './ui/dom';
import { t, locale, formatWhen } from '../i18n';
import { nameWithSize } from './bottle';

type Info = { quiz_open?: boolean; quiz_count?: number; signup_open?: boolean; full?: boolean };
type MapWine = { id: number; region: string | null; appellation: string | null; appellation_id: string | null; country: string | null };

const SOON = 14 * 86400000;
const near = (x: MyTasting) => !x.starts_at || new Date(x.starts_at).getTime() - Date.now() < SOON;
const plural = (n: number) => (n === 1 ? t('home3.winesOne') : t('home3.winesMany', { n }));

function chatSeen(slug: string): number | null {
  try { const v = localStorage.getItem(chatSeenKey(slug)); return v ? Number(v) : null; } catch { return null; }
}

export async function showGuestHome(o: { upcoming: MyTasting[]; past: MyTasting[]; signedIn: boolean }) {
  const { upcoming, past } = o;
  const all = [...upcoming, ...past];
  if (!all.length) return;
  const next = upcoming[0] ?? null;
  const codes = Object.values(getCodes());

  // Everything at once: each upcoming tasting's details, the wine book, the orders
  const [infos, book, orders] = await Promise.all([
    Promise.all(upcoming.map(async (x) => ((await supabase.rpc('get_tasting', { code: x.code })).data ?? {}) as Info)),
    supabase.rpc('my_wine_book', { codes }).then((r) => (r.data ?? []) as BookWine[]),
    loadOrders(o.signedIn),
  ]);
  const info = new Map(upcoming.map((x, i) => [x.slug, infos[i]]));

  if (next) showNext(next, info.get(next.slug) ?? {});
  const others = upcoming.slice(1);
  $('other-list').replaceChildren(...others.map(tastingCard));
  $('other-block').hidden = !others.length;
  await showWaiting(upcoming, past, info, orders);
  showBook(book, all.length, orders);
  showMemories(past, book);
  showMap(book);
}

// ---------- 1. The next tasting, large: the region's map behind, the countdown and answer, one way on ----------
function showNext(x: MyTasting, info: Info) {
  $('next-title').textContent = x.title;
  const count = x.starts_at ? countdown(x.starts_at) : null;
  const chips: HTMLElement[] = [];
  if (count) chips.push(chip(count, 'wait'));
  if (x.status !== 'invited') chips.push(statusChip(guestStatus(x.status)));
  $('next-chips').replaceChildren(...chips);
  $('next-when').textContent = x.starts_at ? formatWhen(x.starts_at) : '';
  $('next-f-when').hidden = !x.starts_at;
  $('next-place').textContent = x.place ?? '';
  $('next-f-place').hidden = !x.place;
  // The one button that fits now: answer first; the quiz while it is open; otherwise the wines
  const go = $<HTMLAnchorElement>('next-go');
  const quiz = info.quiz_open && Number(info.quiz_count ?? 0) > 0;
  const [label, path] = x.status === 'invited' && info.signup_open !== false ? [t('home3.answer'), '']
    : quiz ? [t('home3.openQuiz'), 'quiz/'] : [t('home3.seeWines'), 'wines/'];
  go.textContent = label;
  go.href = tastingUrl(x.slug, path);
  $<HTMLAnchorElement>('next-open').href = tastingUrl(x.slug);
  $('next-block').hidden = false;
  // The map of its wines, faint behind (as behind the tasting's own heading)
  supabase.rpc('get_wines', { code: x.code }).then(({ data }) => {
    const wines = (Array.isArray(data) ? data : []) as MapWine[];
    if (wines.length) winesBackground($('next-map'), wines, true);
  });
}

// ---------- 2. Waiting for you: answers, payments, an open quiz, new chat messages ----------
async function showWaiting(upcoming: MyTasting[], past: MyTasting[], info: Map<string, Info>, orders: OrderLine[]) {
  const rows: HTMLLIElement[] = [];
  const row = (icon: string, title: string, sub: string | null, label: string, href: string) => {
    const pic = mk('span', 'av act-icon');
    pic.innerHTML = iconSvg(icon);
    pic.setAttribute('aria-hidden', 'true');
    const go = Object.assign(mk('a', 'btn small secondary', label), { href });
    return listRow({ pic, title, meta: sub ? [sub] : [], aside: go, cls: 'waiting-row' });
  };
  for (const x of upcoming) {
    const i = info.get(x.slug) ?? {};
    if (x.status === 'invited' && i.signup_open !== false) {
      rows.push(row('mail', t('home3.answerQ', { title: x.title }), x.starts_at ? formatWhen(x.starts_at) : null, t('home3.answer'), tastingUrl(x.slug)));
    }
    if (i.quiz_open && Number(i.quiz_count ?? 0) > 0) rows.push(row('question', t('home3.quizNow', { title: x.title }), null, t('home3.openQuiz'), tastingUrl(x.slug, 'quiz/')));
  }
  // Orders not paid yet, one line per tasting with the total
  const unpaid = new Map<string, { title: string; total: number }>();
  for (const l of orders.filter((l) => !l.paid)) {
    const u = unpaid.get(l.slug) ?? { title: l.title, total: 0 };
    u.total += l.quantity * Number(l.unit_price);
    unpaid.set(l.slug, u);
  }
  for (const [slug, u] of unpaid) rows.push(row('cart', t('home3.payOrder', { title: u.title }), t('home3.toPay', { total: formatKr(u.total) }), t('home3.pay'), tastingUrl(slug, 'cart/')));
  // The evening's price, and new messages – only for the tastings near now
  const recent = [...upcoming.filter(near), ...past.filter((x) => x.starts_at && Date.now() - new Date(x.starts_at).getTime() < 30 * 86400000)];
  const extra = await Promise.all(recent.map(async (x) => {
    const seen = chatSeen(x.slug);
    const [fee, chat] = await Promise.all([
      supabase.rpc('get_tasting_payment', { code: x.code }),
      near(x) ? supabase.rpc('get_chat', { code: x.code, after_id: seen }) : Promise.resolve({ data: [] }),
    ]);
    const f = Array.isArray(fee.data) ? fee.data[0] as { amount: number; paid: boolean } | undefined : undefined;
    const n = ((chat.data ?? []) as { mine?: boolean }[]).filter((m) => !m.mine).length;
    const out: HTMLLIElement[] = [];
    if (f && Number(f.amount) > 0 && !f.paid) out.push(row('cart', t('home3.payFee', { title: x.title }), t('home3.toPay', { total: formatKr(Number(f.amount)) }), t('home3.pay'), tastingUrl(x.slug)));
    if (n > 0) out.push(row('chat', n === 1 ? t('home3.chatOne', { title: x.title }) : t('home3.chatMany', { n, title: x.title }), null, t('home3.read'), tastingUrl(x.slug, 'chat/')));
    return out;
  }));
  rows.push(...extra.flat());
  $('waiting-list').replaceChildren(...rows);
  $('waiting-block').hidden = !rows.length;
}

// ---------- 3. The wine book in short: the numbers and the favourites ----------
function showBook(book: BookWine[], tastings: number, orders: OrderLine[]) {
  const now = Date.now();
  const tasted = book.filter((w) => w.rating != null || (w.starts_at != null && new Date(w.starts_at).getTime() <= now));
  const stat = (id: string, n: number, key: 'book.statWines' | 'book.statTastings' | 'book.statBottles') => {
    $(id).textContent = String(n);
    $(id).nextElementSibling!.textContent = t(key, { n });
  };
  stat('hs-wines', new Set(tasted.map((w) => w.wine_id)).size, 'book.statWines');
  stat('hs-tastings', tastings, 'book.statTastings');
  stat('hs-bottles', orders.reduce((s, l) => s + l.quantity, 0), 'book.statBottles');
  // The three wines with the most stars (four or five), each wine once
  const seen = new Set<number>();
  const favs = [...book].filter((w) => (w.rating ?? 0) >= 4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.rated_at ?? '').localeCompare(a.rated_at ?? ''))
    .filter((w) => !seen.has(w.wine_id) && seen.add(w.wine_id)).slice(0, 3);
  $('fav-list').replaceChildren(...favs.map(wineItem));
  $('fav-h').hidden = !favs.length;
  $('book-block').hidden = false;
}

// ---------- 4. Where the wines come from: one numbered pin per place, on the overview map ----------
async function showMap(book: BookWine[]) {
  const byWine = new Map(book.map((w) => [w.wine_id, w]));
  const placed = (await Promise.all([...byWine.values()].map(async (w) => ({ w, p: await placeOf({ ...w, appellation_id: null }) }))))
    .filter((x): x is { w: BookWine; p: Place } => !!x.p);
  if (!placed.length) return;
  const groups = new Map<string, { p: Place; n: number }>();
  for (const { p } of placed) {
    const key = `${p.lon.toFixed(1)},${p.lat.toFixed(1)}`;
    const g = groups.get(key) ?? { p, n: 0 };
    g.n++;
    groups.set(key, g);
  }
  const list = [...groups.values()];
  const places = list.map((g) => g.p);
  const [ov, focus] = await Promise.all([loadOverview(overviewFor(places)), focusFor(places)]);
  if (!ov) return;
  const box = $('home-map');
  box.innerHTML = drawOverview(ov, list.map((g) => ({ lon: g.p.lon, lat: g.p.lat, n: g.n, label: g.p.label })), focus, 'full', null, await loadTowns());
  $('map-block').hidden = false;
  mapZoom(box);
  setMapCredit(box, OVERVIEW_SOURCES, false, $('home-map-source'));
}

// ---------- 5. The tastings they have been to, each with how many wines and the favourite ----------
function showMemories(past: MyTasting[], book: BookWine[]) {
  $('past-list').replaceChildren(...past.map((x) => {
    const wines = book.filter((w) => w.slug === x.slug);
    const fav = [...wines].filter((w) => (w.rating ?? 0) >= 4).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
    const card = tastingCard(x);
    // A memory: the answer ("Coming") no longer says anything
    card.querySelector('.chips')?.remove();
    if (wines.length) {
      const line = mk('p', 'lmeta memory', [plural(new Set(wines.map((w) => w.wine_id)).size), fav ? t('home3.favourite', { name: nameWithSize(fav.name, fav.bottle_cl, locale()) }) : null].filter(Boolean).join(' · '));
      card.querySelector('.lmain')?.append(line);
    }
    return card;
  }));
  $('past-block').hidden = !past.length;
}
