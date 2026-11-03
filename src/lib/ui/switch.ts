// Component 11 – switch: something that is on or off and saves straight away. The row is the label: a title, a line
// on what it means, and the switch on the right. switchRow() builds one; bindSwitch() connects a static one
// (src/components/ui/Switch.astro). While it saves: a spinner and "Saving …"; an error puts it back and says so;
// after saving a toast.
import { t } from '../../i18n';
import { toast } from '../toast';

export interface SwitchOptions {
  /** Saves the new state; false (or a thrown error) puts the switch back. A string is shown as the error toast. */
  save?: (on: boolean) => Promise<boolean | string | void>;
  /** The toast after saving (default "Saved."); null for none */
  saved?: (on: boolean) => string | null;
}

/** Connects a switch (<input class="switch">) to saving. */
export function bindSwitch(input: HTMLInputElement, opts: SwitchOptions) {
  if (!opts.save) return;
  const row = input.closest<HTMLElement>('.sw-row');
  const small = row?.querySelector('small');
  input.addEventListener('change', async () => {
    const on = input.checked;
    const hint = small?.textContent ?? '';
    const busy = Object.assign(document.createElement('span'), { className: 'sw-busy' });
    busy.innerHTML = '<span class="spin" aria-hidden="true"></span>';
    row?.classList.add('saving');
    row?.insertBefore(busy, input);
    if (small) small.textContent = t('common.saving');
    input.disabled = true;
    input.setAttribute('aria-busy', 'true');
    let res: boolean | string | void = false;
    try { res = await opts.save!(on); } catch { res = false; }
    busy.remove();
    row?.classList.remove('saving');
    input.disabled = false;
    input.removeAttribute('aria-busy');
    if (small) small.textContent = hint;
    if (res === false || typeof res === 'string') {
      input.checked = !on;
      if (res !== '') toast(typeof res === 'string' ? res : t('admin.changeNotSaved'), { kind: 'error' });
      return;
    }
    const msg = opts.saved ? opts.saved(on) : t('common.saved');
    if (msg) toast(msg, { kind: 'ok' });
  });
}

/** One switch row: <label class="sw-row"><input class="switch" role="switch"><span><b>title</b><small>hint</small></span></label> */
export function switchRow(o: { title: string; hint?: string; checked?: boolean; id?: string; plain?: boolean } & SwitchOptions): { el: HTMLLabelElement; input: HTMLInputElement } {
  const el = document.createElement('label');
  el.className = 'sw-row' + (o.plain ? ' plain' : '');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.setAttribute('role', 'switch');
  input.checked = !!o.checked;
  if (o.id) input.id = o.id;
  const text = document.createElement('span');
  text.append(Object.assign(document.createElement('b'), { textContent: o.title }));
  if (o.hint) text.append(Object.assign(document.createElement('small'), { textContent: o.hint }));
  el.append(input, text);
  bindSwitch(input, o);
  return { el, input };
}
