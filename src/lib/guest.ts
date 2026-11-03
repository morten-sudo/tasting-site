// Guest session: which tasting a page belongs to, and the guest's invite code for it.
// A guest can be invited to several tastings, so codes are stored per tasting slug.
// Codes come from an invite link (?k=CODE) or, after an email sign-in, from my_tastings().
import { linkMe } from './link-me';
import { supabase } from './supabase';
import { SUPABASE_URL } from './config';

const CODES_KEY = 'guest_codes';

export type MyTasting = {
  code: string; slug: string; title: string;
  starts_at: string | null; place: string | null; status: string;
};

/** The tasting slug from a /t/<slug>/... path (or ?t= on old links). */
export function currentSlug(): string | null {
  const m = location.pathname.match(/^\/t\/([a-z0-9-]+)(\/|$)/);
  return m ? m[1] : new URLSearchParams(location.search).get('t');
}

/** URL of a page inside a tasting, e.g. tastingUrl('portvin-2026', 'wines/') */
export function tastingUrl(slug: string, page = '') {
  return `/t/${slug}/${page}`;
}

export function getCodes(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CODES_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setCode(slug: string, code: string) {
  const codes = getCodes();
  codes[slug] = code;
  try { localStorage.setItem(CODES_KEY, JSON.stringify(codes)); } catch {}
}

export function forgetCode(slug: string) {
  const codes = getCodes();
  delete codes[slug];
  try { localStorage.setItem(CODES_KEY, JSON.stringify(codes)); } catch {}
}

/** Signed in: whether an invitation belongs to the signed-in email (or has none). Not signed in: always. */
export async function inviteIsMine(code: string): Promise<boolean> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return true;
  const { data } = await supabase.rpc('invite_is_mine', { code });
  return data !== false;
}

/** Stored code for a tasting, without any network calls. */
export function storedCode(slug: string | null = currentSlug()): string | null {
  return slug ? getCodes()[slug] ?? null : null;
}

/** Tastings of the signed-in email; stores their codes as a side effect. */
export async function fetchMyTastings(): Promise<MyTasting[]> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return [];
  const { data } = await supabase.rpc('my_tastings');
  const list = (data ?? []) as MyTasting[];
  for (const t of list) setCode(t.slug, t.code);
  return list;
}

/**
 * The guest's code for the current tasting page:
 * 1. ?k=CODE from an invite link (checked against the slug; wrong slug → redirect)
 * 2. a code stored earlier for this slug
 * 3. the signed-in email's invitation to this tasting
 * 4. the tasting's own host (or co-host): added to the guest list as attending
 */
export async function resolveGuestCode(): Promise<string | null> {
  const slug = currentSlug();
  const fromUrl = new URLSearchParams(location.search).get('k')?.trim();
  if (fromUrl) {
    const { data } = await supabase.rpc('get_tasting', { code: fromUrl });
    const realSlug = (data as { slug?: string } | null)?.slug;
    if (realSlug) {
      // Signed in as someone else than the invitation is for: not opened as theirs
      if (!(await inviteIsMine(fromUrl))) {
        location.replace(`/login/?other=${encodeURIComponent(fromUrl)}`);
        return null;
      }
      setCode(realSlug, fromUrl);
      if (slug !== realSlug) {
        location.replace(tastingUrl(realSlug));
        return null;
      }
      return fromUrl;
    }
  }
  if (!slug) return null;
  const stored = storedCode(slug);
  if (stored) {
    if (await inviteIsMine(stored)) return stored;
    forgetCode(slug);   // remembered from before signing in as someone else
  }
  const mine = await fetchMyTastings();
  const found = mine.find((t) => t.slug === slug)?.code;
  if (found) return found;
  // The tasting's own host (or co-host) without an invitation: put on the guest list as attending
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return null;
  const { data: hostCode } = await supabase.rpc('host_guest_code', { t_slug: slug });
  if (typeof hostCode === 'string' && hostCode) {
    setCode(slug, hostCode);
    return hostCode;
  }
  return null;
}

/** Sign out: forget all codes and end any email session on this device. */
export function signOut() {
  try { localStorage.removeItem(CODES_KEY); localStorage.removeItem('display_name'); } catch {}
  try {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    localStorage.removeItem(`sb-${ref}-auth-token`);
  } catch {}
  supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

// ---------- The person's own name (header and profile page) ----------
const NAME_KEY = 'display_name';

export type Me = { name: string | null; email: string | null; isHost: boolean; signedIn: boolean };

/** Last known name, for showing the header straight away. */
export function cachedName(): string | null {
  try { return localStorage.getItem(NAME_KEY); } catch { return null; }
}
function cacheName(name: string | null) {
  try { name ? localStorage.setItem(NAME_KEY, name) : localStorage.removeItem(NAME_KEY); } catch {}
}

/**
 * Who is using the site: with an email sign-in the account's profile (own name → host name →
 * the name a host invited them by); with only an invite link the name on the invitation.
 */
export async function loadMe(): Promise<Me | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    // Link my invitations to my account first (keeps them after an email change)
    await linkMe();
    const { data: p } = await supabase.rpc('my_profile');
    const prof = (p ?? {}) as { name?: string | null; email?: string; is_host?: boolean };
    const email = data.session.user.email ?? prof.email ?? null;
    const own = (data.session.user.user_metadata?.name as string | undefined)?.trim();
    const name = own || prof.name || (email ? email.split('@')[0] : null);
    cacheName(name);
    return { name, email, isHost: !!prof.is_host, signedIn: true };
  }
  const code = Object.values(getCodes())[0];
  if (!code) { cacheName(null); return null; }
  const { data: inv } = await supabase.rpc('get_invite', { code });
  const row = Array.isArray(inv) ? inv[0] : null;
  if (!row) return null;
  cacheName(row.name);
  return { name: row.name, email: row.email ?? null, isHost: false, signedIn: false };
}

/** Where the newest chat message a guest has seen in a tasting is kept on the device (the chat page writes it, the home page counts the new ones) */
export const chatSeenKey = (slug: string) => `wt-chat-seen:${slug}`;
