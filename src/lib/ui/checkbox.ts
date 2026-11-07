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

// Check cards – choose several among a few rich items (e.g. AI's quiz suggestions): the choice cards' look (10), each
// card a checkbox, its name and more content under it (body). A ticked card gets
// the amber edge, like a chosen choice card. <fieldset class="cc checks"><legend>…</legend><label><input type="checkbox"><span><b>…</b>…</span></label>…</fieldset>
export interface CheckCard { value: string; label: string; body?: Node[] }
export interface CheckCards { el: HTMLFieldSetElement; inputs: () => HTMLInputElement[]; values: () => string[]; add: (cards: CheckCard[]) => void; clear: () => void; setDisabled: (on: boolean) => void }

let ccid = 0;
export function checkCards(o: { id?: string; legend?: string; checked?: boolean; options?: CheckCard[]; onChange?: () => void }): CheckCards {
  const el = document.createElement('fieldset');
  el.className = 'cc checks';
  el.id = o.id ?? `ck-cards-${++ccid}`;
  if (o.legend) el.append(Object.assign(document.createElement('legend'), { textContent: o.legend }));
  const inputs = () => [...el.querySelectorAll<HTMLInputElement>(':scope > label > input')];
  const add = (cards: CheckCard[]) => {
    for (const c of cards) {
      const lab = document.createElement('label');
      const input = Object.assign(document.createElement('input'), { type: 'checkbox', value: c.value, checked: o.checked !== false });
      input.addEventListener('change', () => o.onChange?.());
      const text = document.createElement('span');
      text.append(Object.assign(document.createElement('b'), { textContent: c.label }), ...(c.body ?? []));
      lab.append(input, text);
      el.append(lab);
    }
  };
  add(o.options ?? []);
  return {
    el, inputs, add,
    values: () => inputs().filter((x) => x.checked).map((x) => x.value),
    clear: () => el.querySelectorAll(':scope > label').forEach((l) => l.remove()),
    setDisabled: (on) => { el.classList.toggle('busy', on); inputs().forEach((x) => (x.disabled = on)); },
  };
}
