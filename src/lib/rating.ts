// The guest's own rating (1–5 stars) and private note for a wine. Saved automatically.
import { supabase } from './supabase';
import { t } from '../i18n';
import { toast } from './ui/toast';
import { starsInput } from './ui/stars';

export type MyRating = { wine_id: number; rating: number | null; note: string | null };

export async function fetchMyRatings(code: string): Promise<Map<number, MyRating>> {
  const { data } = await supabase.rpc('get_my_ratings', { code });
  return new Map(((data ?? []) as MyRating[]).map((r) => [r.wine_id, r]));
}

export function ratingBox(code: string, wineId: number, initial?: MyRating) {
  let stars = initial?.rating ?? null;
  let note = initial?.note ?? '';

  const box = document.createElement('section');
  box.className = 'my-rating';

  const head = document.createElement('div');
  head.className = 'rating-head';
  const h = document.createElement('h2');
  h.textContent = t('rating.title');
  head.append(h);

  // The one star component (src/lib/ui/stars.ts); tap the chosen star again to clear
  const rate = starsInput({ value: stars, label: t('rating.title'), onRate: (n) => { stars = n; save(); } });
  const row = rate.el;

  const label = document.createElement('label');
  label.className = 'note-label';
  label.textContent = t('rating.note');
  const area = document.createElement('textarea');
  area.className = 'input rating-note';
  area.maxLength = 2000;
  area.rows = 3;
  area.placeholder = t('rating.notePlaceholder');
  area.value = note;
  const areaId = `note-${wineId}`;
  area.id = areaId;
  label.htmlFor = areaId;

  const hint = document.createElement('p');
  hint.className = 'hint rating-hint';
  hint.textContent = t('rating.private');

  box.append(head, row, label, area, hint);

  // Saved by itself; the toast says so (or that it failed)
  let timer: number | undefined;
  let pending = false;
  async function save() {
    window.clearTimeout(timer);
    pending = false;
    rate.setBusy(true);
    const { error } = await supabase.rpc('rate_wine', { code, w_id: wineId, stars, note: note || null });
    rate.setBusy(false);
    if (error) { toast(t('rating.notSaved'), { kind: 'error' }); return; }
    toast(t('rating.saved'));
    box.dispatchEvent(new CustomEvent('rating-change', { detail: { stars, note }, bubbles: true }));
  }

  area.addEventListener('input', () => {
    note = area.value;
    pending = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(save, 900);
  });
  area.addEventListener('blur', () => { if (pending) save(); });

  return box;
}
