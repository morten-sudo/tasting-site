// The host's page for one guest in the guest library, /admin/guests/<name>/: the tastings of this account the guest is
// invited to, what the guest did there, and the guest's roles on this account. Only this account – the RPC
// guest_profile() gives nothing from other accounts. Editing happens in the guest list's side panel (guests.astro).
import { supabase } from './supabase';
import { seenText, type Seen } from './guest-seen';
import { t, formatWhen, locale, type Key } from '../i18n';
import { $, mk } from './ui/dom';
import { listRow, activityRow, missing } from './ui/list-row';
import { STATUS, guestStatus, type Status } from './ui/status';
import { setEmpty } from './ui/empty';
import { avatar } from './ui/thumb';
import { starsRo } from './ui/stars';
import { formatKr } from './ui/kr';
import { ago } from './ui/ago';
import { tooltip } from './ui/tooltip';
import { textButton } from './ui/text-button';

export type PathGuest = { id: string; name: string; created_at?: string | null };

/** "Anna Holm" → "anna-holm"; Danish letters spelt out (ø → o, æ → ae, å → a) */
const guestSlug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'guest';

/** The address of every guest on the account: /admin/guests/<name>/; two guests with the same name get -2, -3 …
 *  (the one added first keeps the plain name, so an address does not move when another guest is added) */
export function guestPaths(guests: PathGuest[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  const order = [...guests].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
  for (const g of order) {
    const base = guestSlug(g.name);
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    out.set(g.id, `/admin/guests/${slug}/`);
  }
  return out;
}

const UUID = /^\/admin\/guests\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/$/i;

/** The guest on this address: by name, or by the guest's id (/admin/guests/<uuid>/, an address that never changes) */
export function guestIdFromPath(paths: Map<string, string>, path = location.pathname): string | null {
  const p = path.replace(/\/?$/, '/');
  if (p === '/admin/guests/') return null;
  const id = p.match(UUID)?.[1]?.toLowerCase();
  if (id) return [...paths.keys()].find((k) => k.toLowerCase() === id) ?? id;
  const want = decodeURIComponent(p);
  for (const [gid, gp] of paths) if (gp === want) return gid;
  return ''; // an address that matches no guest
}

/** True on any address below /admin/guests/ (a guest's page, found or not). */
export const onGuestPage = (path = location.pathname) => path.replace(/\/?$/, '/') !== '/admin/guests/';

type Tasting = { tasting_id: string; slug: string; title: string; starts_at: string | null; status: string; diet: string | null;
  note: string | null; invite_mailed_at: string | null; invited_at: string; tasting_paid: boolean; has_fee: boolean; waitlist_place: number };
type Act = { kind: 'invited' | 'reply' | 'order' | 'rating' | 'quiz' | 'chat' | 'signin'; at: string; slug: string | null; title: string | null;
  status: string | null; bottles: number | null; amount: number | null; paid: boolean | null; wine: string | null; rating: number | null;
  answered: number | null; correct: number | null; questions: number | null; messages: number | null };
type Profile = { id: string; name: string; email: string | null; tastings: Tasting[]; activity: Act[];
  roles: { account: 'owner' | 'host' | null; account_invited: boolean; cohost: { slug: string; title: string; starts_at: string | null; pending: boolean }[] } };

export interface GuestPageActions {
  /** Opens the guest's side panel */
  edit: () => void;
  /** When the guest was last here (the guest list's "signed in …" / "opened the link …") */
  lastLogin: () => Seen | null;
  /** The host owns the account (may add hosts to it) */
  owner: boolean;
}

const ACT_SHOWN = 12;
const admin = (slug: string, section = '') => `/t/${slug}/admin/${section}`;
/** "28 Oct" – as on the tasting's guest list */
const day = (iso: string) => new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short' });
/** "2 hours ago", with the date and time as the tip */
function when(iso: string) {
  const el = mk('span', '', ago(iso));
  tooltip(el, new Date(iso).toLocaleString());
  return el;
}

export async function showGuestPage(id: string, actions: GuestPageActions) {
  $('guest-list-view').hidden = true;
  $('guest-detail').hidden = false;
  const { data } = id ? await supabase.rpc('guest_profile', { g: id }) : { data: null };
  const p = data as Profile | null;
  if (!p) { $('gd-missing').hidden = false; $('gd-main').hidden = true; return; }
  $('gd-missing').hidden = true;
  $('gd-main').hidden = false;
  document.title = `${p.name} – ${document.title.split(' – ').pop()}`;

  // Head: initials, name, email and when the guest last signed in – and Edit (the side panel)
  $('gd-pic').replaceChildren(avatar(p.name, { size: 'large' }));
  $('gd-name').textContent = p.name;
  const meta = $('gd-meta');
  meta.replaceChildren(p.email ? p.email : missing());
  const seen = actions.lastLogin();
  if (seen) {
    const el = mk('span', '', seenText(seen));
    tooltip(el, new Date(seen.at).toLocaleString());
    meta.append(' · ', el);
  }
  $('gd-edit').onclick = actions.edit;

  // Tastings: one row each – the status as on the tasting's guest list, diet, note, the invitation and the fee
  $('gd-tastings').replaceChildren(...p.tastings.map((x) => {
    const st: Status = STATUS[guestStatus(x.status)];
    const chips: { text: string; tone?: Status['tone']; dashed?: boolean }[] = [
      { text: t(st.key) + (x.status === 'waitlist' && x.waitlist_place ? ` ${x.waitlist_place}` : ''), tone: st.tone, dashed: st.dashed }];
    if (x.has_fee && x.status === 'yes') chips.push(x.tasting_paid ? { text: t('guestRow.paid'), tone: 'ok' } : { text: t('guestRow.unpaid'), tone: 'err' });
    if (x.diet) chips.push({ text: x.diet });
    return listRow({
      title: x.title, href: admin(x.slug, 'guests/'),
      meta: [[x.starts_at ? formatWhen(x.starts_at, { year: true }) : null,
        x.invite_mailed_at ? t('guestRow.mailed', { when: day(x.invite_mailed_at) }) : t('guestRow.notMailed')],
        x.note ? mk('span', 'note', `“${x.note}”`) : null],
      chips,
    });
  }));
  $('gd-tastings').hidden = !p.tastings.length;
  const noTastings = $('gd-tastings-empty');
  if (p.tastings.length) noTastings.hidden = true;
  else setEmpty(noTastings, { icon: 'calendar', title: t('person.noTastingsTitle'), text: t('person.noTastingsText'),
    action: { label: t('person.toTastings'), href: '/admin/tastings/', secondary: true } });

  // Activity: one list, newest first; the first ones, then "Show n more"
  const rows = p.activity.map(activity);
  const list = $('gd-activity');
  const more = $('gd-more');
  list.replaceChildren(...rows.slice(0, ACT_SHOWN));
  more.replaceChildren();
  if (rows.length > ACT_SHOWN) {
    const b = textButton(t('person.showMore', { n: rows.length - ACT_SHOWN }));
    b.addEventListener('click', () => { list.append(...rows.slice(ACT_SHOWN)); more.replaceChildren(); });
    more.append(b);
  }
  list.hidden = !rows.length;
  const noAct = $('gd-activity-empty');
  if (rows.length) noAct.hidden = true;
  else setEmpty(noAct, { icon: 'list', title: t('person.noActivityTitle'), text: t('person.noActivityText') });

  // Roles on this account: host or owner, invited as host, co-host of its tastings
  const r = p.roles;
  const roleRows: HTMLLIElement[] = [];
  if (r.account) roleRows.push(listRow({ pic: avatar(p.name, { host: true }), title: t(r.account === 'owner' ? 'person.roleOwner' : 'person.roleHost'),
    href: '/admin/account/', meta: [t('person.roleHostText')] }));
  else if (r.account_invited) roleRows.push(listRow({ pic: avatar(p.name, { host: true }), title: t('person.roleInvited'), href: '/admin/account/',
    meta: [t('person.roleInvitedText')], chips: [{ text: t(STATUS['host.pending'].key), tone: STATUS['host.pending'].tone }] }));
  // Co-host of a tasting: the tasting (its hosts), its date, and "Co-host" as the hosts' list says it
  for (const c of r.cohost) roleRows.push(listRow({ title: c.title, href: admin(c.slug) + '#hosts',
    meta: [c.starts_at ? formatWhen(c.starts_at, { year: true }) : null],
    chips: [{ text: t(STATUS['host.cohost'].key), tone: STATUS['host.cohost'].tone },
      ...(c.pending ? [{ text: t(STATUS['host.pending'].key), tone: STATUS['host.pending'].tone }] : [])] }));
  $('gd-roles').replaceChildren(...roleRows);
  $('gd-roles').hidden = !roleRows.length;
  const noRoles = $('gd-roles-empty');
  if (roleRows.length) noRoles.hidden = true;
  else if (!p.email) setEmpty(noRoles, { icon: 'user', title: t('person.noRolesTitle'), text: t('person.noRolesNoEmail'),
    action: { label: t('person.addEmail'), secondary: true, onClick: actions.edit } });
  else setEmpty(noRoles, { icon: 'user', title: t('person.noRolesTitle'), text: t('person.noRolesText'),
    action: actions.owner ? { label: t('person.makeHost'), href: '/admin/account/?open=member-open', secondary: true } : undefined });
}

/** One line of what the guest did, with a link to where it happened */
function activity(a: Act): HTMLLIElement {
  const where = a.title ?? null;
  const at = when(a.at);
  const s = a.slug ?? '';
  switch (a.kind) {
    case 'invited':
      return activityRow({ icon: '✉', title: t('person.actInvited', { tasting: where ?? '' }), href: admin(s, 'guests/'), meta: [at] });
    case 'reply': {
      const key: Key = a.status === 'no' ? 'person.actNo' : a.status === 'waitlist' ? 'person.actWaitlist' : 'person.actYes';
      return activityRow({ icon: a.status === 'no' ? '✕' : '✓', title: t(key, { tasting: where ?? '' }), href: admin(s, 'guests/'), meta: [at] });
    }
    case 'order':
      return activityRow({ icon: '🛒', title: t('person.actOrder', { n: a.bottles ?? 0, amount: formatKr(Number(a.amount ?? 0)) }),
        href: admin(s, 'orders/'), meta: [where, a.paid ? t('cart.paid') : t('cart.awaiting'), at] });
    case 'rating':
      return activityRow({ icon: '★', title: [starsRo(a.rating ?? 0), ' ' + (a.wine ?? '')], href: admin(s, 'wines/'), meta: [where, at] });
    case 'quiz':
      return activityRow({ icon: '?', title: t('person.actQuiz', { right: a.correct ?? 0, n: a.answered ?? 0 }), href: admin(s, 'quiz/'),
        meta: [where, (a.answered ?? 0) < (a.questions ?? 0) ? t('quiz.answeredOf', { n: a.answered ?? 0, total: a.questions ?? 0 }) : null, at] });
    case 'chat':
      return activityRow({ icon: '💬', title: t('person.actChat', { n: a.messages ?? 0 }), href: admin(s, 'chat/'), meta: [where, at] });
    default:
      return activityRow({ icon: '→', title: t('person.actSignin'), meta: [at] });
  }
}
