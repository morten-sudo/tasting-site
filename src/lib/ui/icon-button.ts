// Component 3 – icon button: a row's actions ("Edit", "Reveal", "Send invitation", "Copy link"), close (×),
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
