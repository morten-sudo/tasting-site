// Component 3 – icon button: a row's actions ("Edit" – the pencil, editButton() below –, "Reveal", "Send invitation", "Copy link"), close (×),
// arrows. The name shows as a tip on hover and keyboard focus and is read out by screen readers.
// Static markup: src/components/ui/CloseButton.astro gives the same close button.
import { t } from '../../i18n';
import { ICONS, type IconName } from './icons';

export type { IconName } from './icons';
export interface IconButtonOptions {
  size?: 'small' | 'normal' | 'large';  // 36 px (rows), 44 px (panel heads), 48 px round (carousels)
  strong?: boolean;                     // the next step (outlined)
  quiet?: boolean;                      // grey until hovered, then red (remove)
  close?: boolean;                      // dark ×
  tip?: boolean;                        // show the name as a tip (default true)
}

const SIZE = { small: '', normal: ' md', large: ' lg' } as const;

export function iconButton(icon: IconName, label: string, opts: IconButtonOptions = {}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-act' + SIZE[opts.size ?? 'small'] + (opts.strong ? ' strong' : '') + (opts.quiet ? ' quiet' : '') + (opts.close ? ' close' : '');
  b.setAttribute('aria-label', label);
  if (opts.tip !== false) b.dataset.tip = label;
  b.innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  return b;
}

/** An empty place the size of an icon button: keeps a row's icons in columns when one row has an action another
 *  has not (the same icon always in the same place down a list). Not focusable, hidden from screen readers. */
export function iconSpacer(size: IconButtonOptions['size'] = 'small'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'icon-act spacer' + SIZE[size ?? 'small'];
  s.setAttribute('aria-hidden', 'true');
  return s;
}

/** Two icons, two meanings (WIN-299):
 *  - editButton(): the PENCIL, tip "Edit" – changes one or more things here (opens a side panel, or a link straight to
 *    the panel somewhere else). Rows, section heads, a settings row, a page head, a hit in a menu. Static: EditButton.astro.
 *  - adminLink(): the GEAR, tip "Manage" – goes to an area where things are managed (e.g. a tasting's admin from the
 *    guests' tasting page). Always a link. Static: AdminLink.astro.
 *  Screen readers hear "Edit: <what>" / "Manage: <what>"; setEditWhat() fills <what> in later. */
function actionIcon(icon: 'edit' | 'gear', verb: string, what: string | null | undefined, size: IconButtonOptions['size'], href?: string): HTMLButtonElement {
  const b = document.createElement(href ? 'a' : 'button') as HTMLButtonElement;
  if (href) (b as unknown as HTMLAnchorElement).href = href; else b.type = 'button';
  b.className = 'icon-act' + SIZE[size ?? 'small'];
  b.dataset.tip = verb;
  b.innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg><span class="sr"><span>${verb}</span><span class="eb-what"></span></span>`;
  setEditWhat(b, what);
  return b;
}

/** The one edit button: the pencil (see above). href: a link that opens the edit somewhere else. */
export function editButton(what?: string | null, opts: { size?: IconButtonOptions['size']; href?: string } = {}): HTMLButtonElement {
  return actionIcon('edit', t('admin.edit'), what, opts.size, opts.href);
}

/** The one way to an area that is managed: the gear, a link (see above) */
export function adminLink(what: string | null | undefined, href: string, opts: { size?: IconButtonOptions['size'] } = {}): HTMLAnchorElement {
  return actionIcon('gear', t('admin.manage'), what, opts.size, href) as unknown as HTMLAnchorElement;
}

/** What an edit button or admin link is for (the screen-reader name "Edit: <what>") – for static markup filled in later */
export function setEditWhat(b: HTMLElement, what?: string | null) {
  const w = b.querySelector('.eb-what');
  if (w) w.textContent = what ? `: ${what}` : '';
}

/** The one close button (×) – panels, menus, dialogs, the toast */
export function closeButton(label: string = t('admin.close'), size: IconButtonOptions['size'] = 'normal'): HTMLButtonElement {
  return iconButton('x', label, { size, close: true });
}

/** Busy: a spinner instead of the icon, and not clickable meanwhile */
export function setIconLoading(b: HTMLButtonElement, on: boolean) {
  b.classList.toggle('loading', on);
  b.disabled = on;
  b.setAttribute('aria-busy', String(on));
  let s = b.querySelector(':scope > .spin');
  if (on && !s) { s = document.createElement('span'); s.className = 'spin'; s.setAttribute('aria-hidden', 'true'); b.append(s); }
  if (!on) s?.remove();
}
