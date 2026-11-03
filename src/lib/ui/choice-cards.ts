// Component 10 – choice cards: one choice among a few. Each card is a radio, a name and (normal variant) one line on
// what it means; compact: the name only (yes/no, difficulty); tiles: a few short choices side by side, each with its line. src/components/ui/ChoiceCards.astro gives the same markup:
// <fieldset class="cc [compact]"><legend>…</legend><label><input type="radio"><span><b>name</b><small>hint</small></span></label>…</fieldset>
export interface Choice { value: string; label: string; hint?: string; disabled?: boolean; lead?: string; lang?: string }
export interface ChoiceCards { el: HTMLFieldSetElement; value: () => string | null; set: (v: string | null) => void; inputs: HTMLInputElement[]; setDisabled: (on: boolean) => void }

let uid = 0;
export function choiceCards(o: { name?: string; legend?: string; legendId?: string; options: Choice[]; value?: string | null; compact?: boolean; tiles?: boolean; onChange?: (v: string) => void }): ChoiceCards {
  const name = o.name ?? `cc-${++uid}`;
  const el = document.createElement('fieldset');
  el.className = 'cc' + (o.compact ? ' compact' : '') + (o.tiles ? ' tiles' : '');
  if (o.legend) {
    const lg = Object.assign(document.createElement('legend'), { textContent: o.legend });
    if (o.legendId) lg.id = o.legendId;
    el.append(lg);
  }
  const inputs = o.options.map((c) => {
    const lab = document.createElement('label');
    const r = Object.assign(document.createElement('input'), { type: 'radio', name, value: c.value, checked: c.value === o.value, disabled: !!c.disabled });
    const text = document.createElement('span');
    const b = Object.assign(document.createElement('b'), { textContent: c.label });
    if (c.lang) b.lang = c.lang;
    text.append(b);
    if (c.hint && !o.compact) text.append(Object.assign(document.createElement('small'), { textContent: c.hint }));
    lab.append(r);
    if (c.lead) lab.insertAdjacentHTML('beforeend', c.lead);
    lab.append(text);
    r.addEventListener('change', () => { if (r.checked) o.onChange?.(c.value); });
    el.append(lab);
    return r;
  });
  return {
    el, inputs,
    value: () => inputs.find((x) => x.checked)?.value ?? null,
    set: (v) => inputs.forEach((x) => (x.checked = x.value === v)),
    setDisabled: (on) => { el.classList.toggle('busy', on); inputs.forEach((x) => (x.disabled = on)); },
  };
}
