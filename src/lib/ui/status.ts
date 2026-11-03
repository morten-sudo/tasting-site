// Component 18 – chip / status: one word and one tone per status, everywhere (guests, wines, orders, tastings).
// "Not coming" and "Hidden" are neutral with a dashed edge – an answer, not an error. Chips are never buttons.
import { t, type Key } from '../../i18n';
import { tooltip } from './tooltip';

export type ChipTone = 'neutral' | 'ok' | 'wait' | 'warn' | 'err' | 'strong';
export interface Status { key: Key; tone: ChipTone; dashed?: boolean }

export const STATUS = {
  // Guests
  'guest.yes': { key: 'status.yes', tone: 'ok' },
  'guest.waitlist': { key: 'status.waitlist', tone: 'wait' },
  'guest.invited': { key: 'status.invited', tone: 'neutral' },
  'guest.no': { key: 'status.no', tone: 'neutral', dashed: true },
  'guest.note': { key: 'guestRow.note', tone: 'neutral' },
  'guest.paid': { key: 'guestRow.paid', tone: 'ok' },
  'guest.unpaid': { key: 'guestRow.unpaid', tone: 'err' },
  // Hosts
  'host.owner': { key: 'hosts.owner', tone: 'strong' },
  'host.cohost': { key: 'hosts.cohost', tone: 'neutral' },
  'host.pending': { key: 'hosts.pending', tone: 'wait' },
  'host.accountOwner': { key: 'account.owner', tone: 'strong' },
  'host.host': { key: 'account.host', tone: 'neutral' },
  // A tasting's wines
  'wine.shown': { key: 'twe.chipShown', tone: 'ok' },
  'wine.blind': { key: 'blind.blind', tone: 'strong' },
  'wine.hidden': { key: 'twe.hidden', tone: 'neutral', dashed: true },
  'wine.orderable': { key: 'admin.orderable', tone: 'neutral' },
  'wine.notOrderable': { key: 'twe.notOrderable', tone: 'neutral', dashed: true },
  // Orders
  'order.paid': { key: 'cart.paid', tone: 'ok' },
  'order.unpaid': { key: 'cart.awaiting', tone: 'err' },
} satisfies Record<string, Status>;
export type StatusName = keyof typeof STATUS;

/** A guest's answer as a status name ('yes' → 'guest.yes'); unknown answers count as not answered */
export const guestStatus = (s: string | null | undefined): StatusName =>
  (`guest.${s}` in STATUS ? `guest.${s}` : 'guest.invited') as StatusName;

/** The classes for a tone: "chip ok", "chip dashed" … */
export function chipClass(tone: ChipTone = 'neutral', dashed = false): string {
  return 'chip' + (tone !== 'neutral' ? ' ' + tone : '') + (dashed ? ' dashed' : '');
}

/** A chip with its own text */
export function chip(text: string, tone: ChipTone = 'neutral', opts: { dashed?: boolean; title?: string; href?: string } = {}): HTMLElement {
  const el = opts.href ? Object.assign(document.createElement('a'), { href: opts.href }) : document.createElement('span');
  el.className = chipClass(tone, opts.dashed);
  el.textContent = text;
  // A longer explanation (e.g. the guest's note) as the one tip
  if (opts.title) tooltip(el, opts.title);
  return el;
}

/** The chip for a status from the table; `suffix` is added to the word (e.g. the place in the queue: "Waiting list 2") */
export function statusChip(name: StatusName, suffix = ''): HTMLElement {
  const s: Status = STATUS[name];
  return chip(t(s.key) + (suffix ? ' ' + suffix : ''), s.tone, { dashed: s.dashed });
}
