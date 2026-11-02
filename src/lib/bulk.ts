// Quantity prices that count over orders: a line for the guest on how far they (or all the guests together) are.
import { t, money } from '../i18n';
import type { PriceTier } from './wines';

type W = { price_tiers?: PriceTier[] | null; ordered?: number };

/** "Together you have ordered 4 of 6 – 2 more and the price falls to 359,95 kr. for everyone" (or the guest's own
 *  version); null when the wine has no quantity price. inCart: the bottles in the cart that are not ordered yet. */
export function bulkNote(w: W, mode: 'guest' | 'pooled' | null, inCart = 0): string | null {
  const tiers = [...(w.price_tiers ?? [])].filter((x) => x && x.qty >= 2).sort((a, b) => a.qty - b.qty);
  if (!tiers.length) return null;
  const have = (w.ordered ?? 0) + inCart;
  const next = tiers.find((x) => x.qty > have);
  const pooled = mode === 'pooled';
  if (!next) return t(pooled ? 'bulk.reachedAll' : 'bulk.reached', { price: money(Number(tiers[tiers.length - 1].price)) });
  const vars = { have, need: next.qty, more: next.qty - have, price: money(Number(next.price)) };
  if (pooled) return t('bulk.togetherMore', vars);
  return (w.ordered ?? 0) > 0 ? t('bulk.youMore', vars) : null;
}
