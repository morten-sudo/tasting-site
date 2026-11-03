// The ONE way the site writes an amount (component 21): Danish number format and " kr." in every language
// ("2.999,95 kr."), so an amount reads the same for every guest and host – in the pages, the price component
// (src/lib/ui/price.ts) and the host's emails (functions/api/notify.ts). No imports: the server uses it too.
const KR = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 122.5 → "122,50 kr." */
export function formatKr(amount: number | string): string {
  return `${KR.format(Number(amount) || 0)} kr.`;
}
