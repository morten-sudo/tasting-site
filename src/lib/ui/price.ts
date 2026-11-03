// Component 21 – the one price: our price, the regular price struck through on the line below, the quantity prices under it, and
// "Price to follow" when there is none yet. Every amount is written by formatKr() (src/lib/ui/kr.ts).
import { t } from '../../i18n';
import { mk } from './dom';
import { formatKr } from './kr';

export { formatKr };

export interface PriceOptions {
  /** Our price; null shows "Price to follow" */
  amount: number | null | undefined;
  /** The regular price, struck through (only shown when higher than ours) */
  was?: number | null;
  /** Lines in red under the price: the quantity prices ("From 6 bottles: 249,95 kr. each") and the like */
  tiers?: (string | Node)[];
  size?: 'normal' | 'large';
  align?: 'left' | 'right';
  /** What shows without a price (default "Price to follow"; the host's rows say "No price") */
  none?: string;
}

/** <div class="price"> with .now, .was and .tier lines */
export function price(o: PriceOptions): HTMLDivElement {
  const box = mk('div', 'price' + (o.size === 'large' ? ' lg' : '') + (o.align === 'right' ? ' right' : ''));
  if (o.amount == null) {
    box.append(mk('span', 'now none', o.none ?? t('price.follows')));
    return box;
  }
  const now = mk('span', 'now', formatKr(o.amount));
  if (o.was != null && Number(o.was) > Number(o.amount)) {
    // Our price on top, the regular price struck through on the line under it
    const was = mk('span', 'was');
    was.append(mk('span', 'sr', t('wines.normalPrice') + ' '), formatKr(o.was));
    box.append(now, was);
  } else box.append(now);
  for (const line of o.tiers ?? []) {
    const tier = mk('span', 'tier');
    tier.append(line);
    box.append(tier);
  }
  return box;
}
