// A guest's orders across all tastings: with an email sign-in from the database,
// otherwise from the invite links stored on this device. Used by "My wine book".
import { supabase } from './supabase';
import { getCodes, tastingUrl } from './guest';
import { t, money, locale } from '../i18n';

export type OrderLine = { order_id: number; created_at: string; paid: boolean; slug: string; title: string;
  wine_name: string; quantity: number; unit_price: number };

export async function loadOrders(signedIn: boolean): Promise<OrderLine[]> {
  if (signedIn) {
    const { data } = await supabase.rpc('my_orders');
    return (data ?? []) as OrderLine[];
  }
  const out: OrderLine[] = [];
  for (const [slug, code] of Object.entries(getCodes())) {
    const [o, info] = await Promise.all([
      supabase.rpc('get_my_orders', { code }),
      supabase.rpc('get_tasting', { code }),
    ]);
    const title = String((info.data as Record<string, unknown> | null)?.title ?? slug);
    for (const l of (o.data ?? []) as Omit<OrderLine, 'slug' | 'title'>[]) out.push({ ...l, slug, title });
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** One card per order: tasting, date, lines, total and whether it is paid. */
export function orderCards(lines: OrderLine[]): HTMLElement[] {
  const byOrder = new Map<number, OrderLine[]>();
  for (const l of lines) {
    if (!byOrder.has(l.order_id)) byOrder.set(l.order_id, []);
    byOrder.get(l.order_id)!.push(l);
  }
  const date = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  return [...byOrder.values()].map((ls) => {
    const first = ls[0];
    const total = ls.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0);
    const card = document.createElement('a');
    card.className = 'order-card' + (first.paid ? ' paid' : '');
    card.href = tastingUrl(first.slug, 'cart/');
    const head = document.createElement('div');
    head.className = 'card-head';
    const title = document.createElement('span');
    title.className = 'order-title';
    title.textContent = `${first.title} · ${t('pay.orderComment', { id: first.order_id })}`;
    const pill = document.createElement('span');
    pill.className = 'pill ' + (first.paid ? 'pill-yes' : 'pill-invited');
    pill.textContent = first.paid ? t('cart.paid') : t('cart.awaiting');
    head.append(title, pill);
    const meta = document.createElement('span');
    meta.className = 'card-meta';
    meta.textContent = date.format(new Date(first.created_at));
    const ul = document.createElement('ul');
    for (const l of ls) {
      const li = document.createElement('li');
      li.textContent = `${l.quantity} × ${l.wine_name}`;
      ul.append(li);
    }
    const foot = document.createElement('div');
    foot.className = 'order-total';
    foot.textContent = `${t('cart.total')} ${money(total)}`;
    card.append(head, meta, ul, foot);
    return card;
  });
}
