// Small flags for the language switcher (3:2, drawn simply so they read at icon size).
import type { Lang } from './index';

const svg = (viewBox: string, body: string) =>
  `<svg class="flag" viewBox="${viewBox}" width="24" height="16" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;

export const FLAGS: Record<Lang, string> = {
  da: svg('0 0 37 28', '<rect width="37" height="28" fill="#c8102e"/><path d="M12 0h4v28h-4zM0 12h37v4H0z" fill="#fff"/>'),
  en: svg('0 0 60 40', '<rect width="60" height="40" fill="#012169"/><path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0l60 40M60 0L0 40" stroke="#c8102e" stroke-width="3"/><path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="12"/><path d="M30 0v40M0 20h60" stroke="#c8102e" stroke-width="7"/>'),
  is: svg('0 0 25 18', '<rect width="25" height="18" fill="#02529c"/><path d="M7 0h4v18H7zM0 7h25v4H0z" fill="#fff"/><path d="M8 0h2v18H8zM0 8h25v2H0z" fill="#dc1e35"/>'),
  fr: svg('0 0 3 2', '<rect width="1" height="2" fill="#0055a4"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ef4135"/>'),
  de: svg('0 0 5 3', '<rect width="5" height="1" fill="#000"/><rect y="1" width="5" height="1" fill="#dd0000"/><rect y="2" width="5" height="1" fill="#ffce00"/>'),
  it: svg('0 0 3 2', '<rect width="1" height="2" fill="#009246"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ce2b37"/>'),
  es: svg('0 0 3 2', '<rect width="3" height="2" fill="#aa151b"/><rect y="0.5" width="3" height="1" fill="#f1bf00"/>'),
  nl: svg('0 0 9 6', '<rect width="9" height="2" fill="#ae1c28"/><rect y="2" width="9" height="2" fill="#fff"/><rect y="4" width="9" height="2" fill="#21468b"/>'),
  pl: svg('0 0 8 5', '<rect width="8" height="2.5" fill="#fff"/><rect y="2.5" width="8" height="2.5" fill="#dc143c"/>'),
};
