// Fetching pages and pictures from other sites (shops, producers) for the Pages Functions, never anything private:
// only http(s), no local or private addresses – and the same check on every redirect, so a public page cannot send
// the request on to an internal address (A01-003 in the security audit of 2 November 2026).

const TRACKING = /^(utm_|gad_|gclid|gbraid|wbraid|fbclid|mc_|_ga|srsltid)/i;

/** A private, local or reserved IPv4 address (as the URL parser writes it, e.g. 2130706433 → 127.0.0.1) */
function privateIPv4(host: string) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** The URL when it is a public http(s) address, else null. Addresses written as an IP literal are only public IPv4. */
export function publicUrl(raw: string | URL): URL | null {
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || host.startsWith('[')) return null;   // "localhost", "intranet", any IPv6 literal
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return null;
  if (privateIPv4(host)) return null;
  return u;
}

/** Only public http(s) addresses; tracking parameters and the #fragment removed. */
export function cleanUrl(raw: string): URL | null {
  const u = publicUrl(raw);
  if (!u) return null;
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.hash = '';
  return u;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

/**
 * fetch() for an outside address: the address and every redirect it leads to must be public (publicUrl), at most
 * `maxHops` redirects. Throws for a refused address, as fetch does for one it cannot reach. The response's url is
 * the last address (as with redirect: 'follow').
 */
export async function safeFetch(url: string | URL, init: RequestInit = {}, maxHops = 5): Promise<Response> {
  const first = publicUrl(url);
  if (!first) throw new Error('safeFetch: not a public address');
  let u: URL = first;
  let { method = 'GET', body } = init;
  for (let hop = 0; ; hop++) {
    const res = await fetch(u.href, { ...init, method, body, redirect: 'manual' });
    const to = res.headers.get('location');
    if (!REDIRECT.has(res.status) || !to) return res;
    res.body?.cancel().catch(() => {});
    if (hop >= maxHops) throw new Error('safeFetch: too many redirects');
    let next: URL | null = null;
    try { next = publicUrl(new URL(to, u.href)); } catch { /* not an address */ }
    if (!next) throw new Error('safeFetch: redirect to a private address');
    // As browsers do: 303, and 301/302 after a POST, go on as GET without the body
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== 'GET' && method !== 'HEAD')) { method = 'GET'; body = undefined; }
    u = next;
  }
}
