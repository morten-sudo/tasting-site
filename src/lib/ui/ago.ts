// "2 hours ago", "yesterday", "3 weeks ago" … in the active language (Intl.RelativeTimeFormat). A browser without
// data for the language (often Icelandic) gets the site's own words instead of English (WIN-322).
import { locale, t, hasRelativeData, formatDate } from '../../i18n';

/** short: "12 min. ago" (for a narrow column) */
export function ago(iso: string, short = false) {
  // No relative words for the language in this browser: the date and time, in the site's own names
  if (!hasRelativeData()) return formatDate(iso, { month: 'short', time: true });
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: short ? 'short' : 'long' });
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800], ['month', 2629800], ['year', 31557600]];
  if (Math.abs(s) < 60) return rtf.format(0, 'minute');
  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let div = 60;
  for (const [u, d] of steps) if (Math.abs(s) >= d) { unit = u; div = d; }
  return rtf.format(Math.round(s / div), unit);
}

/** "In 21 days", "Tomorrow", "Today" – for a date up to 60 days ahead, in the active language; null otherwise */
export function countdown(iso: string): string | null {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(iso)) - day(new Date())) / 86400000);
  if (days < 0 || days > 60) return null;
  if (!hasRelativeData()) return days === 0 ? t('date.today') : days === 1 ? t('date.tomorrow') : t('date.inDays', { n: days });
  const text = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(days, 'day');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
