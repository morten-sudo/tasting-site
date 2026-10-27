import { EVENT } from './config';

const kr = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' });
const mobilepay = EVENT.mobilepay.replace(/\s/g, '');
const pretty = mobilepay.replace(/(\d{2})(?=\d)/g, '$1 ');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Betalingsboks: knap til MobilePay-appen + nummer, beløb og besked med kopier-knapper.
export function payBox(amount: number, comment: string) {
  const box = el('div', 'pay');
  const amountStr = amount.toFixed(2);

  if (!mobilepay) {
    box.append(el('p', '', `Beløbet på ${kr.format(amount)} betales med MobilePay. Værten fortæller dig hvordan.`));
    return box;
  }

  box.append(el('p', 'pay-lead', `Betal ${kr.format(amount)} med MobilePay`));

  const link = el('a', 'btn pay-btn', 'Åbn MobilePay');
  link.href = `mobilepay://send?phone=${mobilepay}&amount=${amountStr}&comment=${encodeURIComponent(comment)}`;
  box.append(link);

  const dl = el('dl', 'pay-facts');
  const row = (label: string, shown: string, copy: string) => {
    const dd = el('dd');
    dd.append(el('span', '', shown));
    const b = el('button', 'copy', 'Kopiér');
    b.type = 'button';
    b.setAttribute('aria-label', `Kopiér ${label.toLowerCase()}`);
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(copy); b.textContent = 'Kopieret'; }
      catch { b.textContent = copy; }
      setTimeout(() => (b.textContent = 'Kopiér'), 1500);
    });
    dd.append(b);
    dl.append(el('dt', '', label), dd);
  };
  row('Nummer', pretty, mobilepay);
  row('Beløb', kr.format(amount), amountStr.replace('.', ','));
  row('Besked', comment, comment);
  box.append(dl);
  box.append(el('p', 'hint', 'Virker knappen ikke, så åbn MobilePay selv og brug oplysningerne ovenfor.'));
  return box;
}
