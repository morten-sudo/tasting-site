// Component 51 – the payment box: on a phone the button to the MobilePay app, on a computer a QR code the phone's
// camera opens MobilePay from (the app is not on the computer); then the number, the amount and the message as a
// facts list (22) with a copy button each (the toast says what was copied). Used in the cart, the wine book and for
// the tasting's own price on the guest's page.
import { t } from '../i18n';
import { formatKr } from './ui/kr';
import { facts } from './ui/facts';
import { mk } from './ui/dom';
import { qrCode } from './ui/qr';

/** A phone or tablet (where the MobilePay app is) rather than a computer */
const onPhone = () => matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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

  const deep = `mobilepay://send?phone=${mobilepay}&amount=${amountStr}&comment=${encodeURIComponent(comment)}`;
  if (onPhone()) {
    const link = mk('a', 'btn block', t('pay.open'));
    link.href = deep;
    box.append(link);
  } else {
    // On a computer: scan with the phone, which opens MobilePay with the number, the amount and the message filled in
    const scan = mk('div', 'pay-scan');
    scan.append(qrCode(deep, t('pay.qrLabel')), mk('p', 'help', t('pay.scan')));
    box.append(scan);
  }

  const row = (label: string, shown: string, copy: string) =>
    ({ label, value: shown, copy: { text: copy, label: t('pay.copyLabel', { what: label.toLowerCase() }), done: `${t('pay.copied')}: ${shown}` } });
  box.append(facts([
    row(t('pay.number'), pretty, mobilepay),
    row(t('pay.amount'), formatKr(amount), amountStr.replace('.', ',')),
    row(t('pay.message'), comment, comment),
  ])!);
  box.append(mk('p', 'help', t(onPhone() ? 'pay.fallback' : 'pay.fallbackScan')));
  return box;
}
