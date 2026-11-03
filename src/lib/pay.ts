// Component 51 – the payment box: the button to the MobilePay app, then the number, the amount and the message as a
// facts list (22) with a copy button each (the toast says what was copied). Used in the cart, the wine book and for
// the tasting's own price on the guest's page.
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

  const link = mk('a', 'btn block', t('pay.open'));
  link.href = `mobilepay://send?phone=${mobilepay}&amount=${amountStr}&comment=${encodeURIComponent(comment)}`;
  box.append(link);

  const row = (label: string, shown: string, copy: string) =>
    ({ label, value: shown, copy: { text: copy, label: t('pay.copyLabel', { what: label.toLowerCase() }), done: `${t('pay.copied')}: ${shown}` } });
  box.append(facts([
    row(t('pay.number'), pretty, mobilepay),
    row(t('pay.amount'), formatKr(amount), amountStr.replace('.', ',')),
    row(t('pay.message'), comment, comment),
  ])!);
  box.append(mk('p', 'help', t('pay.fallback')));
  return box;
}
