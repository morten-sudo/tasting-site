// Component 51 – the payment box: how to pay, then the number, the amount and the message as a facts list (22) with a
// copy button each (the toast says what was copied). Used in the cart, the wine book and for the tasting's own price on
// the guest's page. No button or QR code into MobilePay: its mobilepay://send link is refused on real phones ("Vi kan
// ikke genkende QR-koden"); a button comes back only for a link that has been tested on a real phone (roadmap 1.8).
import { t } from '../i18n';
import { formatKr } from './ui/kr';
import { facts } from './ui/facts';
import { mk } from './ui/dom';

// Host's MobilePay number, set from the tasting (setPayee).
let mobilepay = '';
export function setPayee(number: unknown) {
  if (typeof number === 'string') mobilepay = number.replace(/\s/g, '');
  else if (number === null) mobilepay = '';
}

export function payBox(amount: number, comment: string) {
  const pretty = mobilepay.replace(/(\d{2})(?=\d)/g, '$1 ');
  const box = mk('div', 'pay');
  const amountStr = amount.toFixed(2);

  if (!mobilepay) {
    box.append(mk('p', '', t('pay.noNumber', { amount: formatKr(amount) })));
    return box;
  }

  box.append(mk('p', 'pay-lead', t('pay.lead', { amount: formatKr(amount) })));

  box.append(mk('p', 'help', t('pay.how')));

  const row = (label: string, shown: string, copy: string) =>
    ({ label, value: shown, copy: { text: copy, label: t('pay.copyLabel', { what: label.toLowerCase() }), done: `${t('pay.copied')}: ${shown}` } });
  box.append(facts([
    row(t('pay.number'), pretty, mobilepay),
    row(t('pay.amount'), formatKr(amount), amountStr.replace('.', ',')),
    row(t('pay.message'), comment, comment),
  ])!);
  return box;
}
