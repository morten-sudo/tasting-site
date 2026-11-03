// Copy a link or a number: an icon button with the copy icon calls this; the toast says it is done.
// When the browser does not allow copying, the text is selected in its field (or shown in the toast) to copy by hand.
import { toast } from './toast';
import { t } from '../../i18n';

export async function copyText(text: string, done: string, field?: HTMLInputElement | null) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    if (field) { field.focus(); field.select(); toast(t('copy.selected')); }
    else toast(`${t('copy.manual')} ${text}`, { kind: 'error' });
  }
}
