// The event log in words: "Louise was added as co-host of Portvin 2026"
import { t, type Key } from '../i18n';

const STATUS: Record<string, Key> = { yes: 'status.yes', no: 'status.no', invited: 'status.invited', waitlist: 'status.waitlist' };

export function eventText(kind: string, d: Record<string, unknown>): string {
  const v: Record<string, string> = {};
  for (const [k, x] of Object.entries(d ?? {})) v[k] = x == null ? '—' : String(x);
  if (kind === 'guest.rsvp') v.status = STATUS[v.status] ? t(STATUS[v.status]) : v.status;
  let key = `ev.${kind}`;
  if ((kind === 'guest.fee_paid' || kind === 'guest.order_paid') && d?.paid === false) key += '_undone';
  return t(key as Key, v) || kind;
}

/** 'host' | 'guest' | 'login' | 'admin' – for the colour of the label */
/** The chip tone of each group in the log (src/lib/ui/status.ts tones) */
export const GROUP_TONE: Record<string, 'ok' | 'neutral' | 'err' | 'strong'> = { guest: 'ok', login: 'neutral', admin: 'err', host: 'strong' };

export const eventGroup = (kind: string) => kind.split('.')[0];
