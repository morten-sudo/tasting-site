// Component 37 – the one fold-out, built in TypeScript (the same markup as src/components/ui/Disclosure.astro).
import { iconSvg } from './icons';
import { mk } from './dom';

export function disclosure(summary: string, body: Node[], opts: { open?: boolean; cls?: string } = {}): HTMLDetailsElement {
  const d = mk('details', 'disc' + (opts.cls ? ' ' + opts.cls : ''));
  d.open = !!opts.open;
  const s = mk('summary');
  s.append(mk('span', '', summary));
  s.insertAdjacentHTML('beforeend', iconSvg('chev', 'chev'));
  const b = mk('div', 'd-body');
  b.append(...body);
  d.append(s, b);
  return d;
}
