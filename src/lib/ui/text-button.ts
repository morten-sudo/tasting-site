// Component 2 – text button / text link: red text, underlined on hover; arrow: 'forward' (Read more →) or
// 'back' (← All wines) as drawn chevrons.
import { iconSvg } from './icons';

export function textButton(label: string, opts: { danger?: boolean; arrow?: 'forward' | 'back'; href?: string; small?: boolean } = {}): HTMLButtonElement | HTMLAnchorElement {
  const el = opts.href ? Object.assign(document.createElement('a'), { href: opts.href }) : Object.assign(document.createElement('button'), { type: 'button' });
  el.className = 'text-btn' + (opts.danger ? ' danger' : '') + (opts.small ? ' small' : '') + (opts.arrow === 'forward' ? ' fwd' : opts.arrow === 'back' ? ' back' : '');
  const text = document.createElement('span');
  text.textContent = label;
  if (opts.arrow === 'back') el.innerHTML = iconSvg('left');
  el.append(text);
  if (opts.arrow === 'forward') el.insertAdjacentHTML('beforeend', iconSvg('right'));
  return el;
}
