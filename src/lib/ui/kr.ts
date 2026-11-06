// The ONE way the site writes an amount (component 21): Danish number format and " kr." in every language
// ("2.999,95 kr."), so an amount reads the same for every guest and host – in the pages, the price component
// (src/lib/ui/price.ts) and the host's emails (functions/api/notify.ts). No imports: the server uses it too.
const KR = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 122.5 → "122,50 kr." */
export function formatKr(amount: number | string): string {
  return `${KR.format(Number(amount) || 0)} kr.`;
}

/** A shop's price in another currency, as the shop shows it and never converted (WIN-281), in the same Danish
 *  number format: 25 EUR → "25,00 €", 19.5 USD → "19,50 US$". An unknown code is written after the number. */
export function formatCurrency(amount: number | string, currency: string): string {
  if (currency === 'DKK') return formatKr(amount);
  try {
    return new Intl.NumberFormat('da-DK', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) || 0);
  } catch {
    return `${KR.format(Number(amount) || 0)} ${currency}`;
  }
}
