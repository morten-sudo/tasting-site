// Component 29 – the one way to change an order: drag a row by its grip (mouse, pen or finger – pointer events), or
// focus the grip and press ↑/↓. The row moves in the list straight away, the numbers (.lno) follow, a live region
// says where it went ("Moved to place 3 of 11"), and save() gets the new order (data-id top to bottom).
export interface ReorderOptions {
  /** The grip inside a row (default .grip) */
  handle?: string;
  /** The rows (default the list's li with data-id) */
  item?: string;
  /** Saves the new order; false says it was not saved (the order is put back) */
  save: (ids: string[], moved: string) => Promise<boolean | void>;
  /** What is read out after a move */
  announce: (pos: number, total: number, row: HTMLElement) => string;
  /** The live region (default: one made after the list) */
  live?: HTMLElement;
}

export function reorder(list: HTMLElement, o: ReorderOptions) {
  const handleSel = o.handle ?? '.grip';
  const itemSel = o.item ?? ':scope > [data-id]';
  const rows = () => [...list.querySelectorAll<HTMLElement>(itemSel)];
  const ids = () => rows().map((r) => r.dataset.id!);
  let live = o.live;
  if (!live) {
    live = document.createElement('p');
    live.className = 'sr';
    live.setAttribute('aria-live', 'polite');
    list.after(live);
  }
  const renumber = () => rows().forEach((r, i) => { const no = r.querySelector('.lno'); if (no) no.textContent = String(i + 1); });

  async function done(row: HTMLElement, before: string[]) {
    const now = ids();
    if (now.join() === before.join()) return;
    renumber();
    live!.textContent = o.announce(now.indexOf(row.dataset.id!) + 1, now.length, row);
    const ok = await o.save(now, row.dataset.id!);
    if (ok === false) {
      // Put the order back as it was
      const byId = new Map(rows().map((r) => [r.dataset.id!, r]));
      for (const id of before) { const r = byId.get(id); if (r) list.append(r); }
      renumber();
    }
  }

  // Dragging: the row follows the pointer between the other rows
  let dragged: HTMLElement | null = null;
  let start: string[] = [];
  list.addEventListener('pointerdown', (e) => {
    const grip = (e.target as Element).closest<HTMLElement>(handleSel);
    if (!grip || e.button !== 0 || !list.contains(grip)) return;
    const row = grip.closest<HTMLElement>('[data-id]');
    if (!row) return;
    e.preventDefault();
    dragged = row;
    start = ids();
    row.classList.add('dragging');
    try { grip.setPointerCapture(e.pointerId); } catch { /* a synthetic event */ }
  });
  list.addEventListener('pointermove', (e) => {
    if (!dragged) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-id]');
    if (!over || over === dragged || over.parentElement !== list) return;
    const box = over.getBoundingClientRect();
    list.insertBefore(dragged, e.clientY < box.top + box.height / 2 ? over : over.nextSibling);
  });
  const end = () => {
    if (!dragged) return;
    const row = dragged;
    row.classList.remove('dragging');
    dragged = null;
    done(row, start);
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);

  // Keys: ↑/↓ on the grip, which keeps the focus
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const grip = (e.target as Element).closest<HTMLElement>(handleSel);
    const row = grip?.closest<HTMLElement>('[data-id]');
    if (!grip || !row) return;
    e.preventDefault();
    const before = ids();
    const all = rows();
    const i = all.indexOf(row);
    const to = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= all.length) return;
    if (e.key === 'ArrowUp') list.insertBefore(row, all[to]);
    else list.insertBefore(row, all[to].nextSibling);
    grip.focus();
    done(row, before);
  });
  return { renumber };
}
