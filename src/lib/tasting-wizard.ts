// New tasting: one form with its details (title, date and times, max guests, place, introduction).
// "Create tasting" creates it and goes to its page, where the "Get started" card leads on to wines, guests and payment.
import { supabase } from './supabase';
import { t } from '../i18n';
import { $, type Host } from './admin-common';
import { initAddress, readAddress, writeAddress } from './address';
import { initWhen, readWhen, readEnd, writeWhen, futureOnly, checkWhen } from './datetime';
import { fieldError, focusField } from './field-error';

type Tasting = { id: string; slug: string } & Record<string, unknown>;

export function initWizard(host: Host, onClose: (slug: string | null) => void) {
  const dialog = $<HTMLDialogElement>('wizard');
  let created: string | null = null;

  initAddress('wz');
  initWhen('wz');
  const val = (id: string) => $<HTMLInputElement>(id).value;
  const FIELDS = ['wz-title-input', 'wz-date-show', 'wz-time', 'wz-end', 'wz-max'];

  // The footer message is for what is not about one field ("could not be created"); it goes when anything changes
  function msg(text = '') { $('wz-msg').textContent = text; $('wz-msg').hidden = !text; }
  dialog.addEventListener('input', () => msg());
  dialog.addEventListener('change', () => msg());

  /** Has anything been typed? Then closing asks first. */
  const typed = () => [...dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type=text], input[type=hidden], textarea')]
    .some((x) => x.value.trim() && !x.readOnly);

  function reset() {
    created = null;
    $<HTMLInputElement>('wz-title-input').value = '';
    writeWhen('wz', null);
    futureOnly('wz', true);
    $<HTMLInputElement>('wz-max').value = '';
    $<HTMLTextAreaElement>('wz-intro').value = '';
    writeAddress('wz', {});
    for (const id of FIELDS) fieldError($(id), null);
    msg();
    leaving(false);
  }

  async function create() {
    const title = val('wz-title-input').trim();
    // Errors under the fields; the first one gets the focus
    if (!title) fieldError($('wz-title-input'), t('admin.titleMissing'));
    const whenOk = checkWhen('wz', true);
    const maxText = val('wz-max').trim();
    const max = maxText ? Number(maxText) : null;
    const maxOk = max == null || (Number.isInteger(max) && max >= 1 && max <= 10000);
    if (!maxOk) fieldError($('wz-max'), t('wizard.maxBad'));
    if (!title || !whenOk || !maxOk) {
      const bad = dialog.querySelector<HTMLElement>('[aria-invalid]');
      if (bad) focusField(bad);
      return;
    }
    const { data, error } = await supabase.rpc('create_tasting', {
      title, place: null, mobilepay: null, starts_at: readWhen('wz'), ...readAddress('wz'),
    });
    if (error || !data) { msg(t('admin.createFailed')); return; }
    const tasting = data as Tasting;
    // What create_tasting does not take
    const intro = $<HTMLTextAreaElement>('wz-intro').value.trim() || null;
    const ends = readEnd('wz');
    const extra = { ...(intro ? { intro } : {}), ...(ends ? { ends_at: ends } : {}), ...(max ? { max_guests: max } : {}) };
    if (Object.keys(extra).length) await supabase.from('tastings').update(extra).eq('id', tasting.id);
    created = tasting.slug;
    dialog.close();
  }

  /** The question in the footer when closing would throw away what was typed. */
  function leaving(on: boolean) {
    $('wz-leave').hidden = !on;
    $('wz-actions').hidden = on;
    if (on) $('wz-leave-stay').focus();
  }
  function requestClose() {
    if (!$('wz-leave').hidden || !typed()) { dialog.close(); return; } // a second Esc closes
    leaving(true);
  }
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); requestClose(); });
  dialog.addEventListener('close', () => onClose(created));
  $('wz-close').addEventListener('click', requestClose);
  $('wz-cancel').addEventListener('click', requestClose);
  $('wz-leave-drop').addEventListener('click', () => dialog.close());
  $('wz-leave-stay').addEventListener('click', () => leaving(false));
  $('wz-create').addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    btn.classList.add('loading');
    try { await create(); } finally { btn.disabled = false; btn.classList.remove('loading'); }
  });
  // Enter in a one-line field creates it too
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).matches('input[type=text]') && !(e.target as HTMLElement).closest('.combo')) {
      e.preventDefault();
      $('wz-create').click();
    }
  });

  function open() {
    reset();
    dialog.showModal();
    if (matchMedia('(min-width: 48rem)').matches) $('wz-title-input').focus();
  }

  return { openNew: open };
}
