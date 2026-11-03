// "2 hours ago", "yesterday", "3 weeks ago" … in the active language (Intl.RelativeTimeFormat)
import { locale } from '../../i18n';

export function ago(iso: string) {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800], ['month', 2629800], ['year', 31557600]];
  if (Math.abs(s) < 60) return rtf.format(0, 'minute');
  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let div = 60;
  for (const [u, d] of steps) if (Math.abs(s) >= d) { unit = u; div = d; }
  return rtf.format(Math.round(s / div), unit);
}
