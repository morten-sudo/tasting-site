// "Search wine": suggestions from the LWIN wine list (Liv-ex, CC BY) while the host types.
import { supabase } from './supabase';
import { t } from '../i18n';
import { countryName, normOrigin } from './origin';
import { styleName } from './wines';

export type LwinWine = {
  lwin: number; display_name: string; producer: string | null; wine: string | null; country: string | null;
  region: string | null; appellation: string | null; appellation_id: string | null; style: string | null; classification: string | null;
};

/** The wine's name as we write it: "Kopke Vintage", "Château Lynch-Bages", "Echo de Lynch-Bages". */
export function lwinName(w: LwinWine): string {
  const producer = w.producer ?? '';
  if (!w.wine) return producer || w.display_name;
  // The wine's own name already names the house (e.g. "Echo de Lynch-Bages")
  const key = normOrigin(producer).split(' ').filter((x) => x.length > 3 && !['chateau', 'domaine', 'quinta', 'bodegas', 'maison'].includes(x));
  const own = normOrigin(w.wine);
  return key.some((k) => own.includes(k)) || !producer ? w.wine : `${producer} ${w.wine}`;
}

export function initLwinSearch(input: HTMLInputElement, list: HTMLUListElement, onPick: (w: LwinWine) => void) {
  let results: LwinWine[] = [];
  let active = -1;
  let turn = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const mark = () => list.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
  const pick = (w: LwinWine) => { close(); input.value = ''; onPick(w); };

  function render() {
    list.replaceChildren(...results.map((w, i) => {
      const li = document.createElement('li');
      li.id = `lwin-${w.lwin}`;
      li.setAttribute('role', 'option');
      const name = document.createElement('b');
      name.textContent = w.display_name;
      const meta = document.createElement('span');
      meta.textContent = [w.region, countryName(w.country), w.style ? styleName(w.style) : null, w.classification].filter(Boolean).join(' · ');
      li.append(name, meta);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(w); });
      li.addEventListener('mousemove', () => { active = i; mark(); });
      return li;
    }));
    if (!results.length) {
      const li = document.createElement('li');
      li.className = 'lwin-none';
      li.textContent = t('lwinSearch.none');
      list.append(li);
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    mark();
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { close(); return; }
    timer = setTimeout(async () => {
      const mine = ++turn;
      const { data } = await supabase.rpc('search_lwin', { q });
      if (mine !== turn) return;
      results = (data ?? []) as LwinWine[];
      active = -1;
      render();
    }, 220);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, results.length - 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active >= 0 ? active : 0]) pick(results[active >= 0 ? active : 0]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  return { reset: () => { input.value = ''; close(); } };
}
