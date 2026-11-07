// Component 51 – the payment box: the MobilePay number (with a copy button), the recipient's name and the amount as a
// facts list (22) – nothing else (WIN-278). Used in the cart (the receipt and unpaid orders) and for the tasting's own
// price on the guest's page. The database gives the number only together with the recipient's name (get_tasting:
// mobilepay and mobilepay_name); without both (or with MobilePay switched off) the guest sees only the amount and
// that the host tells how to pay – MobilePay is not named (WIN-318).
// No button or QR code into MobilePay: its mobilepay://send link is refused on real phones.
import { t } from '../i18n';
import { formatKr } from './ui/kr';
import { facts } from './ui/facts';
import { mk } from './ui/dom';

// The tasting's MobilePay number and the name of the person who gets the money (setPayee, from get_tasting)
let mobilepay = '';
let recipient = '';
export function setPayee(number: unknown, name?: unknown) {
  mobilepay = typeof number === 'string' ? number.replace(/\s/g, '') : '';
  recipient = typeof name === 'string' ? name.trim() : '';
}

/** "12345678" → "12 34 56 78" */
export const prettyNumber = (n: string) => n.replace(/\s/g, '').replace(/(\d{2})(?=\d)/g, '$1 ');

export function payBox(amount: number) {
  const box = mk('div', 'pay');
  // Never a number without the recipient's name
  if (!mobilepay || !recipient) {
    box.append(facts([{ label: t('pay.amount'), value: formatKr(amount) }])!, mk('p', '', t('pay.hostTells')));
    return box;
  }
  const pretty = prettyNumber(mobilepay);
  box.append(facts([
    { label: t('pay.number'), value: pretty, copy: { text: mobilepay, label: t('pay.copyNumber'), done: `${t('pay.copied')}: ${pretty}` } },
    { label: t('pay.recipient'), value: recipient },
    { label: t('pay.amount'), value: formatKr(amount) },
  ])!);
  return box;
}
