// WIN-196: the one-time move of what the browser has stored, from the site's address to the app's.
// REMOVE THIS MODULE (and its <script> in the <head> of src/layouts/Base.astro, src/pages/move.astro, the "move" texts
// and the "move" entry in src/lib/hosts.ts) WHEN MORTEN SAYS SO – then Cloudflare rule 1 (WIN-290 / WIN-291) is
// turned on and sends the app's pages on the site's address to the app address before any page runs.
//
// Why: the browser keeps the login, invitation codes, name, carts, language and account per address. Before WIN-195
// the app's pages were on winetastr.com; now they are on app.winetastr.com, where the browser has none of it.
// While rule 1 is off, an app page opened on the site's address moves it once, in the browser only:
//   1. Site address (handOff): read the stored keys, clear them here, mark the move as done ("wt-moved"), and go to
//      app…/move/#<payload>. With nothing stored (or moved already) it goes straight to the same page on the app.
//   2. App address, /move/ (receive): take the payload out of the address at once (history.replaceState, before
//      Supabase or anything else reads it), store what is not there already – a login only when there is none and
//      only when the page came from the site's address – and say which page to go on to (src/pages/move.astro).
// The payload is only ever after "#": never sent to a server, never a query parameter, never in the Referer
// (browsers do not send "#…", and Referrer-Policy is strict-origin). It runs as the first script of every page
// (the <head> of Base.astro), so it is done before src/lib/supabase.ts creates the client.
import { SITE_ORIGIN, APP_ORIGIN, SUPABASE_URL } from './config';
import { isAppPath } from './hosts';

export const MOVE_PATH = '/move/';
const DONE_KEY = 'wt-moved';
const MAX_AGE_MS = 10 * 60_000;   // a payload older than this (a link copied and opened later) is not used
const AUTH_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
/** What is moved: the keys the site stores (src/lib/supabase.ts, guest.ts, cart.ts, workspace.ts, i18n). */
const KEYS = ['guest_codes', 'display_name', 'lang', 'wt-workspace', 'wt-remember', 'wt-last-email'];
/** Keys that belong to the login: moved only together with it (or when the app has no login at all) */
const WITH_LOGIN = new Set(['display_name', 'wt-workspace', 'wt-remember', 'wt-last-email']);
const isCart = (k: string) => /^cart:[a-z0-9-]{1,80}$/.test(k);

type Payload = { v: 1; at: number; to: string; ls: Record<string, string>; ss: Record<string, string> };
export type MoveResult =
  | { kind: 'moved'; to: string; name: string | null; email: string | null }   // the login came along
  | { kind: 'kept'; to: string; name: string | null; email: string | null }    // already signed in here (as them)
  | { kind: 'plain'; to: string };                                             // nothing to confirm

const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

/** Only a page of the app on the app's own address (so "//evil.example" or "/\\evil" is never followed). */
export function safeTarget(raw: unknown, origin = location.origin): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 2000) return '/home/';
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin || !isAppPath(u.pathname) || u.pathname === MOVE_PATH) return '/home/';
    return u.pathname + u.search + u.hash;
  } catch { return '/home/'; }
}

/** The login stored in a session value: who it is (for the confirmation), or null when it is not a session. */
function who(value: string | null): { name: string | null; email: string | null } | null {
  if (!value) return null;
  const s = safe(() => JSON.parse(value)) as { access_token?: unknown; user?: { email?: unknown; user_metadata?: { name?: unknown } } } | null;
  if (!s || typeof s.access_token !== 'string') return null;
  const email = typeof s.user?.email === 'string' ? s.user.email : null;
  const name = typeof s.user?.user_metadata?.name === 'string' ? s.user.user_metadata.name : null;
  return { name, email };
}

// ---------- 1. The site's address: hand the stored data over ----------
function handOff() {
  const path = location.pathname;
  const to = path + location.search + location.hash;
  const go = (url: string) => { location.replace(url); };
  const ls: Record<string, string> = {};
  const ss: Record<string, string> = {};
  const done = safe(() => localStorage.getItem(DONE_KEY)) === '1';
  safe(() => {
    for (const k of Object.keys(localStorage)) if (KEYS.includes(k) || isCart(k) || k === AUTH_KEY) ls[k] = localStorage.getItem(k) ?? '';
  });
  safe(() => { const v = sessionStorage.getItem(AUTH_KEY); if (v) ss[AUTH_KEY] = v; });
  // Cleared here first, so the move happens once (also when the app address keeps its own login). The language
  // stays: the site's own pages (the front page) use it too
  const clear = () => {
    safe(() => { for (const k of Object.keys(ls)) if (k !== 'lang') localStorage.removeItem(k); localStorage.setItem(DONE_KEY, '1'); });
    safe(() => sessionStorage.removeItem(AUTH_KEY));
  };
  const nothing = !Object.keys(ls).length && !Object.keys(ss).length;
  if (done || nothing) {
    // Moved already (anything here now was written after the move) or nothing stored: just the same page on the app
    if (done) clear();
    go(APP_ORIGIN + to);
    return;
  }
  const payload: Payload = { v: 1, at: Date.now(), to, ls, ss };
  clear();
  go(`${APP_ORIGIN}${MOVE_PATH}#${b64(JSON.stringify(payload))}`);
}

// ---------- 2. The app's address, /move/: store what came ----------
function receive(): MoveResult {
  const raw = location.hash.slice(1);
  // Out of the address before anything else can read it (Supabase looks at "#…" for logins of its own)
  history.replaceState(history.state, '', location.pathname);
  const p = raw ? (safe(() => JSON.parse(unb64(raw))) as Payload | null) : null;
  if (!p || p.v !== 1 || typeof p.at !== 'number' || Date.now() - p.at > MAX_AGE_MS || Date.now() < p.at - 60_000) return { kind: 'plain', to: '/home/' };
  const to = safeTarget(p.to);
  const ls = p.ls && typeof p.ls === 'object' ? p.ls : {};
  const ss = p.ss && typeof p.ss === 'object' ? p.ss : {};
  const str = (v: unknown) => (typeof v === 'string' && v.length <= 20_000 ? v : null);

  // The login: only when there is none here, and only from the site's own address (a link with someone else's login
  // opened from anywhere else is never signed in)
  const here = safe(() => localStorage.getItem(AUTH_KEY)) ?? safe(() => sessionStorage.getItem(AUTH_KEY));
  const hereWho = who(here);
  const fromSite = safe(() => new URL(document.referrer).origin) === SITE_ORIGIN;
  const incomingLs = str(ls[AUTH_KEY]);
  const incomingSs = str(ss[AUTH_KEY]);
  const incoming = incomingLs ?? incomingSs;
  const incomingWho = who(incoming);
  let moved = false;
  if (incoming && incomingWho && !hereWho && fromSite) {
    safe(() => (incomingLs ? localStorage : sessionStorage).setItem(AUTH_KEY, incoming));
    moved = true;
  }
  // The rest: never over what is here already. What belongs to a login only comes with it (or when there is no
  // login here at all); invitation codes are added to the ones here (the database checks each one is yours)
  const takeLoginKeys = moved || (!hereWho && !incomingWho);
  for (const [k, v0] of Object.entries(ls)) {
    const v = str(v0);
    if (v == null || k === AUTH_KEY || !(KEYS.includes(k) || isCart(k))) continue;
    if (WITH_LOGIN.has(k) && !takeLoginKeys) continue;
    if (k === 'guest_codes') {
      const theirs = safe(() => JSON.parse(v)) as Record<string, unknown> | null;
      const mine = (safe(() => JSON.parse(localStorage.getItem(k) ?? '{}')) ?? {}) as Record<string, unknown>;
      if (!theirs || typeof theirs !== 'object') continue;
      const merged: Record<string, string> = {};
      for (const [slug, code] of Object.entries({ ...theirs, ...mine })) {
        if (/^[a-z0-9-]{1,80}$/.test(slug) && typeof code === 'string' && code.length <= 64) merged[slug] = code;
      }
      safe(() => localStorage.setItem(k, JSON.stringify(merged)));
      continue;
    }
    if (safe(() => localStorage.getItem(k)) == null) safe(() => localStorage.setItem(k, v));
  }
  if (moved) return { kind: 'moved', to, ...incomingWho! };
  if (incomingWho && hereWho) return { kind: 'kept', to, ...hereWho };
  return { kind: 'plain', to };
}

/** What /move/ did (null on every other page). */
export let moveResult: MoveResult | null = null;

const split = SITE_ORIGIN !== APP_ORIGIN;
if (split && location.origin === SITE_ORIGIN && isAppPath(location.pathname) && location.pathname !== MOVE_PATH) {
  handOff();
} else if (location.pathname === MOVE_PATH) {
  if (split && location.origin === SITE_ORIGIN) {
    // /move/ belongs on the app's address
    location.replace(APP_ORIGIN + MOVE_PATH + location.hash);
  } else {
    moveResult = receive();
    // Nothing to confirm: straight on
    if (moveResult.kind === 'plain') location.replace(moveResult.to);
  }
}
