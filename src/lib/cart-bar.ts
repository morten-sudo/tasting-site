// Component 50 – the cart bar (src/components/ui/CartBar.astro): the number of bottles in the cart and what they
// cost, kept up to date as the guest adds wines. The same on the wine list and on a wine's page.
import { plural } from '../i18n';
import { getCart, cartCount } from './cart';
import { unitPrice, type Wine } from './wines';
import { formatKr } from './ui/kr';
import { $ } from './ui/dom';

export function initCartBar(wines: () => Pick<Wine, 'id' | 'price_dkk' | 'price_tiers'>[]) {
  const draw = () => {
    const cart = getCart();
    let total = 0;
    for (const w of wines()) total += (cart[w.id] ?? 0) * unitPrice(w, cart[w.id] ?? 0);
    const bottles = cartCount(cart);
    $('cartbar').hidden = bottles === 0;
    $('cartbar-count').textContent = plural(bottles, 'wines.bottlesOne', 'wines.bottlesMany');
    $('cartbar-total').textContent = formatKr(total);
  };
  window.addEventListener('cart-change', draw);
  draw();
  return draw;
}
