// Component 53 – the leaderboard: place, name, how far (answered of all) and points; the guest's own line marked.
// The same list on the quiz page, in the host's quiz tab and – larger (.big) – on the big screen.
import { supabase } from './supabase';
import { t } from '../i18n';
import { mk } from './ui/dom';

/** A line on the board. Only the tasting's hosts get full names; everyone else gets the first name (plus the first
 *  letter of the surname when the first name occurs twice) – the database decides (tasting_board, WIN-173).
 *  `mine` is the line of the invite code the call was made with. */
export type Row = { name: string; points: number; answered: number; mine?: boolean };

export async function fetchLeaderboard(opts: { code?: string | null; slug?: string | null } = {}): Promise<Row[] | null> {
  const { data, error } = await supabase.rpc('tasting_board', {
    code: opts.code ?? null,
    slug: opts.slug ?? null,
  });
  if (error) return null;
  return data as Row[];
}

/** Renders the leaderboard into an <ol class="board">. Tied places share the same rank; total is the number of
 *  questions (0 when not known: the progress is left out). The line marked `mine` is the guest's own. */
export function renderLeaderboard(list: HTMLOListElement, rows: Row[], total: number) {
  let rank = 0;
  let prev = -1;
  list.replaceChildren(...rows.map((r, i) => {
    if (r.points !== prev) { rank = i + 1; prev = r.points; }
    const mine = r.mine === true;
    const li = mk('li', mine ? 'me' : '');
    if (mine) li.setAttribute('aria-current', 'true');
    const who = mk('span', 'who', r.name);
    if (mine) who.append(mk('span', 'you', ` (${t('hosts.you')})`));
    li.append(mk('span', 'pos', String(rank)), who,
      mk('span', 'pr', !total ? '' : r.answered >= total ? t('board.done') : `${r.answered}/${total}`),
      mk('span', 'pts', String(r.points)));
    return li;
  }));
}
