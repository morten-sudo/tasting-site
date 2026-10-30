// The cart is stored in the browser until the guest submits the order.
// Format: { [wineId]: quantity }

const KEY = 'cart';
export const MAX_PER_WINE = 48;

export type Cart = Record<string, number>;

export function getCart(): Cart {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function save(cart: Cart) {
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch {}
  window.dispatchEvent(new CustomEvent('cart-change', { detail: cart }));
}

export function setQty(wineId: number, qty: number) {
  const cart = getCart();
  const n = Math.max(0, Math.min(MAX_PER_WINE, Math.floor(qty)));
  if (n === 0) delete cart[wineId];
  else cart[wineId] = n;
  save(cart);
}

export function addToCart(wineId: number, qty = 1) {
  setQty(wineId, (getCart()[wineId] ?? 0) + qty);
}

export function clearCart() {
  save({});
}

export function cartCount(cart: Cart = getCart()) {
  return Object.values(cart).reduce((s, n) => s + n, 0);
}
