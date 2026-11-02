// Row actions as icons (a list's "Edit", "Reveal", "Send invitation", "Copy link"): the name shows as a tip
// on hover and keyboard focus and is read out by screen readers.
const ICONS = {
  edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  reveal: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/><path d="M10 11v5.5M14 11v5.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.2-1.2"/>',
} as const;
export type IconName = keyof typeof ICONS;
export function iconButton(icon: IconName, label: string, opts: { strong?: boolean; quiet?: boolean } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-act' + (opts.strong ? ' strong' : '') + (opts.quiet ? ' quiet' : '');
  b.setAttribute('aria-label', label);
  b.dataset.tip = label;
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  return b;
}

