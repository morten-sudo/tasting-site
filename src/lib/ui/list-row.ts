// Component 25 – the one list row: every list on the site (a tasting's wines and guests, the wine and guest libraries,
// hosts, quiz questions, orders, the dashboard, superadmin) and – as the card variant – the guests' cards (their
// tastings, orders and wine book). Slots, all optional but the title:
//   lead:   grip (drag to reorder, src/lib/ui/reorder.ts) · number · picture (wineThumb() or avatar())
//   main:   title (a link, or a button that opens the side panel) · meta lines · chips · extra content
//   aside:  price, bottles … (right; under the title in a narrow list)
//   activityRow(): an icon in a circle as the picture – one line of what happened (dashboard, a guest's page)
//   actions: icon buttons (iconButton()) – the row's actions; no form fields in a row.
// The list is <ul class="list"> (rows) or <ul class="cards"> (cards).
import { chip, type ChipTone } from './status';
import { iconSvg } from './icons';
import { tooltip } from './tooltip';
import { avatar } from './thumb';
import { t } from '../../i18n';
import { mk } from './dom';

export interface RowChip { text: string; tone?: ChipTone; dashed?: boolean; title?: string; href?: string }
type Part = string | Node | null | undefined | false;
/** One meta line; an array is joined with " · " */
export type MetaLine = Part | Part[];

export interface ListRowOptions {
  variant?: 'row' | 'card';
  /** data-id: what highlight(), reorder() and the page find the row by */
  id?: string | number;
  /** A grip to drag the row (reorder.ts wires it); the label names the row ("Move Kopke Fine White") */
  grip?: { label: string; tip?: string; describedBy?: string } | 'blank';
  no?: string | number;
  pic?: Node | null;
  title: string | Node;
  /** A small line above the title (a wine's type: the style tag) */
  kicker?: Node | null;
  /** Shown after the title in a quieter voice, e.g. "(you)" */
  titleNote?: string | null;
  /** The title is a link … */
  href?: string;
  /** … or opens the side panel */
  onOpen?: () => void;
  meta?: MetaLine[];
  chips?: (RowChip | HTMLElement)[];
  /** More content in the main column (an order's lines …) */
  body?: Node[];
  aside?: Node | string | null;
  actions?: HTMLElement[];
  /** Card variant: a line at the bottom (total and status …) */
  foot?: Node[];
  /** Card variant: the whole card is the link (the title is then plain text) */
  cardHref?: string;
  /** Card variant: the body font for the title (a compact card) */
  small?: boolean;
  cls?: string;
}

const el = mk;

function metaLine(line: MetaLine): HTMLElement | null {
  const parts = (Array.isArray(line) ? line : [line]).filter((x): x is string | Node => x !== '' && x != null && x !== false);
  if (!parts.length) return null;
  const p = el('p', 'lmeta');
  parts.forEach((x, i) => { if (i) p.append(' · '); p.append(x); });
  return p;
}

function chipEl(c: RowChip | HTMLElement) {
  return c instanceof HTMLElement ? c : chip(c.text, c.tone, { dashed: c.dashed, title: c.title, href: c.href });
}

export function listRow(o: ListRowOptions): HTMLLIElement {
  const card = o.variant === 'card';
  const li = el('li', card ? 'lcard-item' : 'lrow' + (o.cls ? ' ' + o.cls : ''));
  const box: HTMLElement = card
    ? (o.cardHref ? Object.assign(el('a', 'lcard'), { href: o.cardHref }) : el('div', 'lcard'))
    : li;
  if (card) {
    if (o.cls) box.className += ' ' + o.cls;
    if (o.small) box.classList.add('small');
    li.append(box);
  }
  if (o.id != null) li.dataset.id = String(o.id);

  // Lead: grip, number, picture
  if (o.grip || o.no != null || o.pic) {
    const lead = el('span', 'llead');
    if (o.grip === 'blank') {
      const g = el('span', 'grip blank');
      g.setAttribute('aria-hidden', 'true');
      lead.append(g);
    } else if (o.grip) {
      const g = el('button', 'grip');
      g.type = 'button';
      g.setAttribute('aria-label', o.grip.label);
      if (o.grip.describedBy) g.setAttribute('aria-describedby', o.grip.describedBy);
      if (o.grip.tip) tooltip(g, o.grip.tip);
      g.innerHTML = iconSvg('grip');
      lead.append(g);
    }
    if (o.no != null) lead.append(el('span', 'lno', String(o.no)));
    if (o.pic) lead.append(o.pic);
    box.append(lead);
  }

  // Main: title, meta, chips
  const main = el('div', 'lmain');
  let title: HTMLElement;
  if (o.href && !o.cardHref) { title = el('a', 'ltitle'); (title as HTMLAnchorElement).href = o.href; }
  else if (o.onOpen && !o.cardHref) { title = el('button', 'ltitle'); (title as HTMLButtonElement).type = 'button'; title.addEventListener('click', o.onOpen); }
  else title = el('span', 'ltitle');
  title.append(o.title);
  if (o.titleNote) title.append(el('span', 'you', ` (${o.titleNote})`));
  const chips = o.chips?.length ? el('div', 'chips') : null;
  chips?.append(...o.chips!.map(chipEl));
  if (o.kicker) main.append(o.kicker);
  if (card) {
    const top = el('div', 'lc-top');
    top.append(title);
    if (chips) top.append(chips);
    main.append(top);
  } else main.append(title);
  for (const line of o.meta ?? []) { const p = metaLine(line); if (p) main.append(p); }
  if (o.body?.length) { const b = el('div', 'lbody'); b.append(...o.body); main.append(b); }
  if (chips && !card) main.append(chips);
  if (card && o.foot?.length) { const f = el('div', 'lfoot'); f.append(...o.foot); main.append(f); }
  box.append(main);

  if (o.aside != null && o.aside !== '') {
    const a = el('div', 'laside');
    a.append(o.aside);
    box.append(a);
  }
  if (o.actions?.length) {
    const a = el('div', 'lacts');
    a.append(...o.actions);
    box.append(a);
  }
  return li;
}

// ---------- People: guests, hosts – the same row with initials for a picture ----------
export interface PersonRowOptions {
  name: string;
  you?: string | null;
  meta?: Part[];
  /** A second meta line (e.g. the last sign-in, shown on phones only) */
  more?: Part[];
  chips?: RowChip[];
  side?: Node | null;
  actions?: HTMLElement[];
  onOpen?: () => void;
  /** The name is a link to the person's own page instead (the guest library) */
  href?: string;
  id?: string;
  host?: boolean;
}

/** A person: avatar, the name (opens the panel when it can be edited, or the person's page), one meta line, chips, aside and icons */
export function personRow(o: PersonRowOptions): HTMLLIElement {
  return listRow({
    id: o.id, pic: avatar(o.name, { host: o.host }), title: o.name, titleNote: o.you, onOpen: o.onOpen, href: o.href,
    meta: [...(o.meta?.length ? [o.meta] : []), ...(o.more?.some(Boolean) ? [o.more] : [])], chips: o.chips, aside: o.side ?? null, actions: o.actions, cls: 'person',
  });
}

// ---------- Activity: what happened – the dashboard's latest activity, a guest's page ----------
export interface ActivityRowOptions {
  /** A short sign in the circle (✓, 🛒, ★ …) */
  icon: string;
  /** What happened – text, or nodes (e.g. stars and the wine's name) */
  title: string | (string | Node)[];
  /** Where it happened and when; joined with " · " */
  meta?: Part[];
  /** The title is a link to where it happened */
  href?: string | null;
}

/** One line of activity: an icon in a circle (the row's picture), what happened (the link), where and when */
export function activityRow(o: ActivityRowOptions): HTMLLIElement {
  const pic = el('span', 'av act-icon', o.icon);
  pic.setAttribute('aria-hidden', 'true');
  const title = document.createDocumentFragment();
  title.append(...(typeof o.title === 'string' ? [o.title] : o.title));
  return listRow({ pic, title, href: o.href ?? undefined, meta: o.meta?.length ? [o.meta] : [], cls: 'activity' });
}

/** "(missing)" in a meta line: red, e.g. "No email" */
export const missing = (text: string = t('admin.noEmail')) => el('span', 'err', text);
