// The site's line icons (24×24, drawn with the current colour). icon('x') gives the <svg>; the same set is used by
// iconButton(), the text buttons' arrows and src/components/ui/Icon.astro.
export const ICONS = {
  edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  reveal: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/><path d="M10 11v5.5M14 11v5.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.2-1.2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
  ext: '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
  camera: '<path d="M4 8h3l1.8-2.5h6.4L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
  cart: '<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3"/>',
  send: '<path d="M4 12 20 4l-4.5 16-3.5-6.5z"/><path d="M12 13.5 20 4"/>',
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  glass: '<path d="M7.5 3.5h9l-.4 5.2a4.1 4.1 0 0 1-8.2 0z"/><path d="M12 13v7M8.5 20.5h7"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z"/><path d="M12 6.5v13"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  home: '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/>',
  grapes: '<circle cx="6.6" cy="10.5" r="2.6"/><circle cx="12" cy="10.5" r="2.6"/><circle cx="17.4" cy="10.5" r="2.6"/><circle cx="9.3" cy="15.4" r="2.6"/><circle cx="14.7" cy="15.4" r="2.6"/><circle cx="12" cy="20.2" r="2.6"/><path d="M12 7.9c0-2-.3-3.5-1.1-4.9"/><path d="M13.2 6.6c.4-2.2 2.1-3.3 4.6-3.4-.3 2.4-1.9 3.5-4.6 3.4z"/>',
  food: '<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 8V6.5M10.5 6.5h3"/><path d="M3 20h18"/>',
  serving: '<path d="M14 14.5V4a2 2 0 0 0-4 0v10.5a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.8M12 17v.2"/>',
  bottle: '<path d="M10.8 2.5h2.4v5c0 1 .4 1.6 1.2 2.3 1.2 1 2 2.4 2 4.3v6.4a1 1 0 0 1-1 1H8.6a1 1 0 0 1-1-1v-6.4c0-1.9.8-3.3 2-4.3.8-.7 1.2-1.3 1.2-2.3z"/><path d="M10.8 4.5h2.4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  tv: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4M7 12V9M11 12V7M15 12v-2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5S9.6 5.9 12 3.5z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.8-3.3 3.1-5 6-5s5.2 1.7 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.2 14.2c2.4.1 4 1.6 4.8 4.3"/>',
  verified: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  winery: '<path d="M3 21V11l5-4 5 4v10"/><path d="M13 21V7.5L17 4l4 3.5V21"/><path d="M2 21h20M6.5 21v-4h3v4M16 11h2M16 14.5h2"/>',
  vineyard: '<path d="M2.5 9.5c4-2.6 8.5-3.3 13.5-1.8"/><path d="M2.5 13c5-3.2 10.5-3.8 17-1.3"/><path d="M5 16.8c5-3.4 10.5-4.2 16.5-2.2"/><path d="M12 17c2.6-2.4 5.6-3.8 9.5-4.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/>',
  drop: '<path d="M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/><path d="M9 15.5a3 3 0 0 0 3 3"/>',
  wind: '<path d="M3 9.5h11.5a2.7 2.7 0 1 0-2.6-3.3"/><path d="M4.5 13h14.3a2.5 2.5 0 0 1 0 5"/><path d="M3 16.5h8.5a2.6 2.6 0 1 1-2.5 3.1"/>',
  taste: '<path d="M4 9.5c2.5-2 5.2-3 8-3s5.5 1 8 3"/><path d="M4 9.5c1.8 5 4.5 7.5 8 7.5s6.2-2.5 8-7.5"/><path d="M8.5 13c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5"/>',
  scale: '<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
  barrel: '<path d="M6.8 3.5h10.4c1.2 2.5 1.8 5.3 1.8 8.5s-.6 6-1.8 8.5H6.8C5.6 18 5 15.2 5 12s.6-6 1.8-8.5z"/><path d="M5.6 7h12.8M5.6 17h12.8"/><path d="M9.5 3.5c-.6 2.6-.9 5.4-.9 8.5s.3 5.9.9 8.5M14.5 3.5c.6 2.6.9 5.4.9 8.5s-.3 5.9-.9 8.5"/>',
  'barrel-grapes': '<path d="M6.8 3.5h10.4c1.2 2.5 1.8 5.3 1.8 8.5s-.6 6-1.8 8.5H6.8C5.6 18 5 15.2 5 12s.6-6 1.8-8.5z"/><path d="M5.6 7h12.8M5.6 17h12.8"/><path d="M9.5 3.5c-.6 2.6-.9 5.4-.9 8.5s.3 5.9.9 8.5"/><circle cx="17.2" cy="16.4" r="4.3" fill="#fff" stroke="none"/><circle cx="15.6" cy="15" r="1.5"/><circle cx="18.8" cy="15" r="1.5"/><circle cx="17.2" cy="17.9" r="1.5"/>',
  trend: '<path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15.5 7H21v5.5"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/>',
  gem: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
  compare: '<path d="M4 8h15M15.5 4.5 19 8l-3.5 3.5"/><path d="M20 16H5M8.5 12.5 5 16l3.5 3.5"/>',
} as const;
export type IconName = keyof typeof ICONS;

/** The icon as an <svg class="i"> string */
export function iconSvg(name: IconName, cls = ''): string {
  return `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

/** The icon as an element */
export function icon(name: IconName, cls = ''): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = iconSvg(name, cls);
  return t.content.firstElementChild as SVGSVGElement;
}
