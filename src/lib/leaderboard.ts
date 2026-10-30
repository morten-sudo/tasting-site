import { supabase } from './supabase';

export type Row = { name: string; points: number; answered: number };

export async function fetchLeaderboard(opts: { code?: string | null; slug?: string | null } = {}): Promise<Row[] | null> {
  const { data, error } = await supabase.rpc('tasting_leaderboard', {
    code: opts.code ?? null,
    slug: opts.slug ?? null,
  });
  if (error) return null;
  return data as Row[];
}

// Tegner pointtavlen i et <ol>. Delte placeringer får samme nummer.
export function renderLeaderboard(list: HTMLOListElement, rows: Row[], total: number, me?: string) {
  list.replaceChildren();
  let rank = 0;
  let prev = -1;
  rows.forEach((r, i) => {
    if (r.points !== prev) { rank = i + 1; prev = r.points; }
    const li = document.createElement('li');
    if (me && r.name === me) li.classList.add('me');

    const pos = document.createElement('span');
    pos.className = 'pos';
    pos.textContent = String(rank);

    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = r.name;

    const progress = document.createElement('span');
    progress.className = 'progress';
    progress.textContent = r.answered >= total ? 'færdig' : `${r.answered}/${total}`;

    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = String(r.points);

    li.append(pos, who, progress, pts);
    list.append(li);
  });
}
