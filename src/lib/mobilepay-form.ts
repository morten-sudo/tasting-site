// A tasting's MobilePay fields (src/components/MobilePayFields.astro): the switch, the number and the recipient's name
// (WIN-278). The rule lives in the database (tastings_payee_named): while MobilePay is on both are required and the
// number must be a Danish MobilePay number. Here: "required" errors under the fields straight away, the database's
// answer turned into the same errors, and – before a tasting exists – the database's own number check.
import { t } from '../i18n';
import { supabase } from './supabase';
import { fieldError } from './field-error';
import { prettyNumber } from './pay';

export type MobilePay = { on: boolean; number: string; name: string };
type Patch = { mobilepay_on: boolean; mobilepay?: string; mobilepay_name?: string };

export function mobilePayForm(prefix: string) {
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(`${prefix}-${id}`) as T;
  const onInput = byId<HTMLInputElement>('mp-on');
  const numberInput = byId<HTMLInputElement>('mp-number');
  const nameInput = byId<HTMLInputElement>('mp-name');
  const clear = () => { fieldError(numberInput, null); fieldError(nameInput, null); };

  // Off: the fields stay visible but cannot be changed; what is in them is kept for when it is turned on again
  function sync() {
    numberInput.disabled = nameInput.disabled = !onInput.checked;
    if (!onInput.checked) clear();
  }
  onInput.addEventListener('change', () => {
    sync();
    if (onInput.checked) (!numberInput.value.trim() ? numberInput : !nameInput.value.trim() ? nameInput : numberInput).focus();
  });

  const read = (): MobilePay => ({ on: onInput.checked, number: numberInput.value.replace(/\s/g, ''), name: nameInput.value.trim() });

  /** On: both are required. Errors under the fields; the first one gets the focus. */
  function check(): boolean {
    clear();
    const v = read();
    if (!v.on) return true;
    let first: HTMLInputElement | null = null;
    if (!v.number) { fieldError(numberInput, t('mp.numberNeeded')); first = numberInput; }
    if (!v.name) { fieldError(nameInput, t('mp.nameNeeded')); first ??= nameInput; }
    first?.focus();
    return !first;
  }

  /** The database's answer as errors under the fields; false when it was something else */
  function showError(message: string): boolean {
    const field = message.includes('mobilepay_number_bad') ? [numberInput, 'mp.badNumber'] as const
      : message.includes('mobilepay_number_missing') ? [numberInput, 'mp.numberNeeded'] as const
      : message.includes('mobilepay_name_missing') ? [nameInput, 'mp.nameNeeded'] as const : null;
    if (!field) return false;
    fieldError(field[0], t(field[1]));
    field[0].focus();
    return true;
  }

  return {
    set(v: MobilePay) {
      onInput.checked = v.on;
      numberInput.value = v.number ? prettyNumber(v.number) : '';
      nameInput.value = v.name;
      clear();
      sync();
    },
    read,
    check,
    showError,
    /** Before the tasting exists: the database's number check (mobilepay_number_ok), shown under the field */
    async checkNumber(): Promise<boolean> {
      const v = read();
      if (!v.on) return true;
      const { data, error } = await supabase.rpc('mobilepay_number_ok', { n: v.number });
      if (error || data === true) return true;
      return !showError('mobilepay_number_bad');
    },
    /** What to save: on saves the number and name; off saves only the switch, so they are kept */
    patch(): Patch {
      const v = read();
      return v.on ? { mobilepay_on: true, mobilepay: v.number, mobilepay_name: v.name } : { mobilepay_on: false };
    },
    focus() { (onInput.checked ? (!numberInput.value ? numberInput : nameInput.value ? numberInput : nameInput) : onInput).focus(); },
  };
}
