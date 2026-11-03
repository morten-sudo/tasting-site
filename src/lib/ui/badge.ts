// Component 19 – the one badge: a number on an icon (the cart's bottles, "99+" above 99), a dot for "new" or
// "yours", and a number after a word (tab counts, filter counts). No badge at 0. The number is for the eye;
// the button or link it sits on says it in its own name (aria-label). Static markup: Badge.astro.
import { mk } from './dom';

/** count: on an icon · dot: on an icon (new) · mark: a dot after a word (yours) · inline: a number after a word ·
 *  neutral: a quiet number after a word */
export type BadgeKind = 'count' | 'dot' | 'mark' | 'inline' | 'neutral';
const CLS: Record<BadgeKind, string> = { count: 'badge', dot: 'badge dot', mark: 'badge dot inline', inline: 'badge inline', neutral: 'badge inline neutral' };

export const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/** A new badge; for "count" and "inline" the number is shown (hidden at 0) */
export function badge(n: number | null, kind: BadgeKind = 'count'): HTMLSpanElement {
  const b = mk('span', CLS[kind]);
  // On an icon the button or link names the number; after a word it is read with the word ("Guests 22")
  if (kind === 'count' || kind === 'dot' || kind === 'mark') b.setAttribute('aria-hidden', 'true');
  if (kind !== 'dot' && kind !== 'mark') setBadge(b, n ?? 0);
  return b;
}

/** Shows the number (99+ above 99) or hides the badge at 0 */
export function setBadge(b: HTMLElement, n: number) {
  b.textContent = badgeText(n);
  b.hidden = !n;
}
