// A guest's orders across all tastings: with an email sign-in from the database,
// otherwise from the invite links stored on this device. Used by "My wine book".
import { formatKr } from './ui/kr';
import { supabase } from './supabase';
import { getCodes, tastingUrl } from './guest';
import { statusChip } from './ui/status';
import { listRow } from './ui/list-row';
import { t, locale } from '../i18n';
import { mk } from './ui/dom';

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

/** One card per order (the card variant of the one list row): tasting and number, date, lines, total, paid or not. */
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
    const ul = mk('ul');
    for (const l of ls) ul.append(mk('li', '', `${l.quantity} × ${l.wine_name}`));
    return listRow({
      variant: 'card', small: true, cardHref: tastingUrl(first.slug, 'cart/'),
      title: `${first.title} · ${t('pay.orderComment', { id: first.order_id })}`,
      chips: [statusChip(first.paid ? 'order.paid' : 'order.unpaid')],
      meta: [date.format(new Date(first.created_at))], body: [ul], foot: [mk('span', '', t('cart.total')), mk('b', '', formatKr(total))],
    });
  });
}
