// Component 24 – the one table: a white frame that scrolls sideways when it must, headers that sort (a button with
// an arrow and aria-sort on the sorted column), numbers right-aligned in tabular figures, a total row at the bottom.
// On phones every row becomes a small card: the first cell as its title, the others as "label value" pairs.
// An empty table is not drawn: the empty state (with a way forward) takes its place.
import { iconSvg } from './icons';
import { emptyState, type EmptyOptions } from './empty';
import { mk } from './dom';

type Content = string | number | Node | null | undefined;

export interface Column<R> {
  key: string;
  label: string;
  /** Right-aligned, tabular figures */
  num?: boolean;
  /** What the cell shows (default: the row's value for key) */
  cell?: (r: R) => Content | Content[];
  /** What the column sorts by; a column without it does not sort */
  sort?: (r: R) => string | number | null | undefined;
  /** Sorted from the highest first when chosen */
  desc?: boolean;
  /** Kept on one line (dates, amounts) */
  nowrap?: boolean;
  /** Only shown on larger screens (on phones the card leaves it out) */
  wideOnly?: boolean;
}

export interface TableOptions<R> {
  columns: Column<R>[];
  rows?: R[];
  /** The column it is sorted by to begin with */
  sort?: { key: string; desc?: boolean };
  /** A total row at the bottom: one entry per column */
  foot?: (r: R[]) => Content[];
  empty?: EmptyOptions;
  /** A name for screen readers (the table's caption) */
  caption?: string;
  cls?: string;
}

export interface TableHandle<R> { el: HTMLElement; setRows: (rows: R[]) => void }

/** One table cell (the only one on the site) */
export function cell(content: Content | Content[], cls = '', label?: string): HTMLTableCellElement {
  const td = mk('td', cls);
  for (const c of Array.isArray(content) ? content : [content]) if (c != null && c !== '') td.append(typeof c === 'number' ? String(c) : c);
  if (label) td.dataset.label = label;
  return td;
}

const cls = (c: Column<never>) => [c.num && 'num', c.nowrap && 'nw', c.wideOnly && 'wide'].filter(Boolean).join(' ');

export function table<R>(o: TableOptions<R>): TableHandle<R> {
  const box = mk('div', 'tbl');
  const scroll = mk('div', 'tscroll');
  const tbl = mk('table', 'table' + (o.cls ? ' ' + o.cls : ''));
  if (o.caption) tbl.append(mk('caption', 'sr', o.caption));
  const head = mk('thead');
  const hr = mk('tr');
  const body = mk('tbody');
  const foot = mk('tfoot');
  let rows = o.rows ?? [];
  let sortKey = o.sort?.key ?? null;
  let desc = o.sort?.desc ?? false;
  const empty = o.empty ? emptyState(o.empty) : null;

  const ths = o.columns.map((c) => {
    const th = mk('th', cls(c));
    th.scope = 'col';
    if (c.sort) {
      const b = mk('button');
      b.type = 'button';
      b.append(c.label);
      b.insertAdjacentHTML('beforeend', iconSvg('up'));
      b.addEventListener('click', () => {
        if (sortKey === c.key) desc = !desc; else { sortKey = c.key; desc = !!c.desc; }
        draw();
      });
      th.append(b);
    } else th.append(c.label);
    hr.append(th);
    return th;
  });
  head.append(hr);
  tbl.append(head, body, foot);
  scroll.append(tbl);
  box.append(scroll);
  if (empty) box.append(empty);

  const fill = (tr: HTMLTableRowElement, values: (Content | Content[])[]) =>
    o.columns.forEach((c, i) => tr.append(cell(values[i], cls(c), i ? c.label : undefined)));

  function draw() {
    const col = o.columns.find((c) => c.key === sortKey);
    const list = col?.sort ? [...rows].sort((a, b) => {
      const va = col.sort!(a) ?? '', vb = col.sort!(b) ?? '';
      const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'da');
      return desc ? -d : d;
    }) : rows;
    body.replaceChildren(...list.map((r) => {
      const tr = mk('tr');
      fill(tr, o.columns.map((c) => (c.cell ? c.cell(r) : (r as Record<string, Content>)[c.key])));
      return tr;
    }));
    foot.replaceChildren();
    if (o.foot && list.length) { const tr = mk('tr'); fill(tr, o.foot(list)); foot.append(tr); }
    ths.forEach((th, i) => {
      if (o.columns[i].key === sortKey && o.columns[i].sort) th.setAttribute('aria-sort', desc ? 'descending' : 'ascending');
      else th.removeAttribute('aria-sort');
    });
    scroll.hidden = !!empty && !list.length;
    if (empty) empty.hidden = !!list.length;
  }
  draw();
  return { el: box, setRows: (r) => { rows = r; draw(); } };
}
