// New tasting: one form with its details (title, date and times, max guests, place, introduction) and MobilePay – empty
// and off; nothing is taken over from the host's last tasting (WIN-278, Morten 6 Nov).
// "Create tasting" creates it and goes to its page, where the "Get started" card leads on to wines, guests and payment.
import { setLoading } from './ui/button';
import { supabase } from './supabase';
import { t } from '../i18n';
import { $, type Host } from './admin-common';
import { initAddress, readAddress, writeAddress } from './address';
import { initWhen, readWhen, readEnd, writeWhen, futureOnly, checkWhen } from './datetime';
import { fieldError, focusField } from './field-error';
import { toast } from './ui/toast';
import { confirmModal } from './ui/confirm';
import { mobilePayForm } from './mobilepay-form';

type Tasting = { id: string; slug: string } & Record<string, unknown>;

export function initWizard(host: Host, onClose: (slug: string | null) => void) {
  const dialog = $<HTMLDialogElement>('wizard');
  let created: string | null = null;

  initAddress('wz');
  initWhen('wz');
  const val = (id: string) => $<HTMLInputElement>(id).value;
  const FIELDS = ['wz-title-input', 'wz-date-show', 'wz-time', 'wz-end', 'wz-max'];
  const mp = mobilePayForm('wz');
  let empty = '';

  /** Has anything been typed? Then closing asks first. */
  const typed = () => [...dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type=text]:not(#wz-mp-name), input[type=hidden], textarea')]
    .some((x) => x.value.trim() && !x.readOnly) || JSON.stringify(mp.read()) !== empty;

  function reset() {
    created = null;
    $<HTMLInputElement>('wz-title-input').value = '';
    writeWhen('wz', null);
    futureOnly('wz', true);
    $<HTMLInputElement>('wz-max').value = '';
    $<HTMLTextAreaElement>('wz-intro').value = '';
    writeAddress('wz', {});
    for (const id of FIELDS) fieldError($(id), null);
    mp.set({ on: false, number: '', name: '' });
    empty = JSON.stringify(mp.read());
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
    const mpOk = mp.check() && await mp.checkNumber();
    if (!title || !whenOk || !maxOk || !mpOk) {
      const bad = dialog.querySelector<HTMLElement>('[aria-invalid]');
      if (bad) focusField(bad);
      return;
    }
    const { data, error } = await supabase.rpc('create_tasting', {
      title, place: null, mobilepay: null, starts_at: readWhen('wz'), ...readAddress('wz'), tn: host.tenant_id,
    });
    if (error || !data) { toast(t('admin.createFailed'), { kind: 'error' }); return; }
    const tasting = data as Tasting;
    // What create_tasting does not take
    const intro = $<HTMLTextAreaElement>('wz-intro').value.trim() || null;
    const ends = readEnd('wz');
    const extra = { ...(intro ? { intro } : {}), ...(ends ? { ends_at: ends } : {}), ...(max ? { max_guests: max } : {}), ...mp.patch() };
    const { error: e2 } = await supabase.from('tastings').update(extra).eq('id', tasting.id);
    // The tasting is there; what did not save can be changed on its page
    if (e2) toast(t('admin.changesNotSaved'), { kind: 'error' });
    created = tasting.slug;
    dialog.close();
  }

  /** Closing with something typed asks first (the one confirmation) */
  let asking = false;
  async function requestClose() {
    if (asking) return;
    if (typed()) {
      asking = true;
      const drop = await confirmModal({ title: t('wizard.discardQ'), ok: t('wineWizard.discardYes'), cancel: t('wineWizard.discardNo'), danger: true });
      asking = false;
      if (!drop) return;
    }
    dialog.close();
  }
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); requestClose(); });
  dialog.addEventListener('close', () => onClose(created));
  $('wz-close').addEventListener('click', requestClose);
  $('wz-cancel').addEventListener('click', requestClose);
  $('wz-create').addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    setLoading(btn, true);
    try { await create(); } finally { setLoading(btn, false); }
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
    // Phones: the keyboard would cover the form – start on the heading, not on × (which would show its tip)
    else { const h = $('wz-title'); h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }

  return { openNew: open };
}
