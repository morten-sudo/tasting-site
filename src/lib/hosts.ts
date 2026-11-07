// Which address a page lives on (WIN-195). One build is served on two addresses: the site (the front page and its
// public pages) and the app (everything you sign in to, the guests' tastings, help and superadmin). Links between the
// two halves are full addresses; links within a half stay relative.
//   - Astro (build time): siteUrl() / appUrl() give the full address of the build's pair (src/lib/config.ts).
//   - In the browser: fixHostLinks() makes every link right for the address the page is open on. On the build's own
//     pair, a relative link to the other half gets that half's full address; anywhere else (a *.pages.dev preview,
//     localhost) the pair's addresses become relative again, so a preview keeps working as one site.
// Cloudflare rules send a page opened on the wrong address to the right one (WIN-196, WIN-290, WIN-291).
import { SITE_ORIGIN, APP_ORIGIN } from './config';

/** The site's pages (everything else that is a page belongs to the app). */
const FRONT = new Set(['/', '/plans/', '/about/', '/privacy/', '/terms/', '/contact/', '/404/']);
/** The app's pages (assets, /api/ and the like are on both and are left alone). */
const APP = /^\/(login|signup|home|my|profile|admin|superadmin|tasting|dev)(\/|$)|^\/t\//;

const slashed = (path: string) => (path.endsWith('/') || /\.[a-z0-9]+$/i.test(path) ? path : path + '/');
export const isFrontPath = (path: string) => FRONT.has(slashed(path)) || path === '/404.html';
export const isAppPath = (path: string) => APP.test(path);

/** Build time: the full address of a page on the site / the app (with the build's pair). */
export const siteUrl = (path = '/') => SITE_ORIGIN + path;
export const appUrl = (path = '/') => APP_ORIGIN + path;

/** In the browser: is this page open on the build's own pair of addresses? */
const onPair = () => location.origin === SITE_ORIGIN || location.origin === APP_ORIGIN;

/** In the browser: the link to a path, a full address when it is on the other half than this page. */
export function hostHref(path: string): string {
  if (!onPair()) return path;
  const origin = isFrontPath(path.split(/[?#]/)[0]) ? SITE_ORIGIN : isAppPath(path) ? APP_ORIGIN : location.origin;
  return origin === location.origin ? path : origin + path;
}

function fixOne(a: HTMLAnchorElement) {
  const raw = a.getAttribute('href');
  if (!raw) return;
  let next = raw;
  if (raw.startsWith('/') && !raw.startsWith('//')) next = hostHref(raw);
  else if (!onPair()) {
    // Not on the pair (a preview, localhost): the pair's full addresses become this address's own pages
    for (const o of [SITE_ORIGIN, APP_ORIGIN]) if (raw === o || raw.startsWith(o + '/')) next = raw.slice(o.length) || '/';
  } else if (raw.startsWith(location.origin + '/')) next = hostHref(raw.slice(location.origin.length));
  if (next !== raw) a.setAttribute('href', next);
}

/** Makes every link on the page (also ones added later, e.g. translated text and lists) right for this address. */
export function fixHostLinks(root: ParentNode = document) {
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(fixOne);
  if (root !== document) return;
  new MutationObserver((changes) => {
    for (const c of changes) {
      if (c.type === 'attributes') { if (c.target instanceof HTMLAnchorElement) fixOne(c.target); continue; }
      c.addedNodes.forEach((n) => {
        if (n instanceof HTMLAnchorElement) fixOne(n);
        if (n instanceof Element) n.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(fixOne);
      });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
}
