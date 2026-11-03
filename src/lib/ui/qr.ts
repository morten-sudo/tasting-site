// Component 54 – a QR code: drawn as one SVG path in the text colour (sharp at any size, no picture to fetch).
// Used where a phone has to take over from a computer: the payment box (MobilePay) on a laptop.
import qrcode from 'qrcode-generator';
import { mk } from './dom';

export function qrCode(text: string, label: string): HTMLElement {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 4; // the quiet zone around the code, in modules
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  const box = mk('div', 'qr');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', label);
  box.innerHTML = `<svg viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
  return box;
}
