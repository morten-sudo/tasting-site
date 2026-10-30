import { t, money } from '../i18n';
// Host's MobilePay number, set from the tasting (setPayee).
let mobilepay = '';
export function setPayee(number: unknown) {
  if (typeof number === 'string') mobilepay = number.replace(/\s/g, '');
  else if (number === null) mobilepay = '';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Payment box: button to the MobilePay app plus number, amount and message with copy buttons.
export function payBox(amount: number, comment: string) {
  const pretty = mobilepay.replace(/(\d{2})(?=\d)/g, '$1 ');
  const box = el('div', 'pay');
  const amountStr = amount.toFixed(2);

  if (!mobilepay) {
    box.append(el('p', '', t('pay.noNumber', { amount: money(amount) })));
    return box;
  }

  box.append(el('p', 'pay-lead', t('pay.lead', { amount: money(amount) })));

  const link = el('a', 'btn pay-btn', t('pay.open'));
  link.href = `mobilepay://send?phone=${mobilepay}&amount=${amountStr}&comment=${encodeURIComponent(comment)}`;
  box.append(link);

  const dl = el('dl', 'pay-facts');
  const row = (label: string, shown: string, copy: string) => {
    const dd = el('dd');
    dd.append(el('span', '', shown));
    const b = el('button', 'copy', t('pay.copy'));
    b.type = 'button';
    b.setAttribute('aria-label', t('pay.copyLabel', { what: label.toLowerCase() }));
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(copy); b.textContent = t('pay.copied'); }
      catch { b.textContent = copy; }
      setTimeout(() => (b.textContent = t('pay.copy')), 1500);
    });
    dd.append(b);
    dl.append(el('dt', '', label), dd);
  };
  row(t('pay.number'), pretty, mobilepay);
  row(t('pay.amount'), money(amount), amountStr.replace('.', ','));
  row(t('pay.message'), comment, comment);
  box.append(dl);
  box.append(el('p', 'hint', t('pay.fallback')));
  return box;
}
