// The person's tastings (email sign-in and invite links on this device) as cards.
// Used by /tastings/ and the profile page.
import { supabase } from './supabase';
import { fetchMyTastings, getCodes, tastingUrl, type MyTasting } from './guest';
import { t, formatWhen, type Key } from '../i18n';

const STATUS: Record<string, [Key, string]> = {
  yes: ['status.yes', 'pill-yes'],
  no: ['status.no', 'pill-no'],
  invited: ['status.invited', 'pill-invited'],
};

// Tastings opened with an invite link on this device (no email sign-in needed)
async function fromStoredCodes(skip: Set<string>): Promise<MyTasting[]> {
  const entries = Object.entries(getCodes()).filter(([slug]) => !skip.has(slug));
  const rows = await Promise.all(entries.map(async ([, code]) => {
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

export function tastingCard(x: MyTasting) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'tasting-card';
  a.href = tastingUrl(x.slug);

  const head = document.createElement('div');
  head.className = 'card-head';
  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = x.title;
  const [label, cls] = STATUS[x.status] ?? STATUS.invited;
  const pill = document.createElement('span');
  pill.className = `pill ${cls}`;
  pill.textContent = t(label);
  head.append(title, pill);
  a.append(head);

  const parts = [x.starts_at ? formatWhen(x.starts_at, { year: true }) : null, x.place].filter(Boolean);
  if (parts.length) {
    const meta = document.createElement('span');
    meta.className = 'card-meta';
    meta.textContent = parts.join(' · ');
    a.append(meta);
  }
  li.append(a);
  return li;
}
