// Component 12 – checkbox: only for "choose several" and consent (anything switched on or off is a switch, 11).
// <label class="check"><input type="checkbox">text</label>; src/components/ui/Checkbox.astro gives the same.
export function checkbox(label: string, opts: { checked?: boolean; id?: string; small?: boolean } = {}): { el: HTMLLabelElement; input: HTMLInputElement } {
  const el = document.createElement('label');
  el.className = 'check' + (opts.small ? ' small' : '');
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!opts.checked });
  if (opts.id) input.id = opts.id;
  el.append(input, Object.assign(document.createElement('span'), { textContent: label }));
  return { el, input };
}
