// The person's tastings (email sign-in and invite links on this device) as cards.
// Used by the home page, the front page and the profile page.
import { supabase } from './supabase';
import { fetchMyTastings, getCodes, tastingUrl, inviteIsMine, forgetCode, type MyTasting } from './guest';
import { t, formatWhen } from '../i18n';
import { statusChip, guestStatus } from './ui/status';
import { listRow } from './ui/list-row';


// Tastings opened with an invite link on this device (no email sign-in needed)
async function fromStoredCodes(skip: Set<string>): Promise<MyTasting[]> {
  const entries = Object.entries(getCodes()).filter(([slug]) => !skip.has(slug));
  const rows = await Promise.all(entries.map(async ([slug, code]) => {
    // Signed in: only invitations to that email (others remembered from before are forgotten)
    if (!(await inviteIsMine(code))) { forgetCode(slug); return null; }
    const [tr, inv] = await Promise.all([
      supabase.rpc('get_tasting', { code }),
      supabase.rpc('get_invite', { code }),
    ]);
    const info = tr.data as Record<string, unknown> | null;
    const row = Array.isArray(inv.data) ? inv.data[0] : null;
    if (!info?.slug || !row) return null;
    return {
      code, slug: String(info.slug), title: String(info.title ?? ''),
      starts_at: (info.starts_at as string | null) ?? null, place: (info.place as string | null) ?? null,
      status: row.status as string,
    } satisfies MyTasting;
  }));
  return rows.filter((r): r is MyTasting => r !== null);
}

/** All my tastings, split into upcoming (soonest first) and past (latest first). */
export async function loadAllMyTastings() {
  const mine = await fetchMyTastings();
  const all = [...mine, ...(await fromStoredCodes(new Set(mine.map((x) => x.slug))))];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const upcoming = all.filter((x) => !x.starts_at || new Date(x.starts_at).getTime() >= cutoff)
    .sort((a, b) => (a.starts_at ?? '9999').localeCompare(b.starts_at ?? '9999'));
  const past = all.filter((x) => x.starts_at && new Date(x.starts_at).getTime() < cutoff)
    .sort((a, b) => b.starts_at!.localeCompare(a.starts_at!));
  return { all, upcoming, past };
}

/** A tasting as the card variant of the one list row: title, the guest's answer as a chip (also "Waiting list"),
 *  when and where; the whole card opens the tasting. */
export function tastingCard(x: MyTasting) {
  return listRow({
    variant: 'card', cardHref: tastingUrl(x.slug), title: x.title,
    chips: [statusChip(guestStatus(x.status))],
    meta: [[x.starts_at ? formatWhen(x.starts_at, { year: true }) : null, x.place]],
  });
}
