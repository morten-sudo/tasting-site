// Guest session: which tasting a page belongs to, and the guest's invite code for it.
// A guest can be invited to several tastings, so codes are stored per tasting slug.
// Codes come from an invite link (?k=CODE) or, after an email sign-in, from my_tastings().
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
 */
export async function resolveGuestCode(): Promise<string | null> {
  const slug = currentSlug();
  const fromUrl = new URLSearchParams(location.search).get('k')?.trim();
  if (fromUrl) {
    const { data } = await supabase.rpc('get_tasting', { code: fromUrl });
    const realSlug = (data as { slug?: string } | null)?.slug;
    if (realSlug) {
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
  if (stored) return stored;
  const mine = await fetchMyTastings();
  return mine.find((t) => t.slug === slug)?.code ?? null;
}

/** Sign out: forget all codes and end any email session on this device. */
export function signOut() {
  try { localStorage.removeItem(CODES_KEY); } catch {}
  try {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    localStorage.removeItem(`sb-${ref}-auth-token`);
  } catch {}
  supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}
