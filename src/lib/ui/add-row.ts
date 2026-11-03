// Component 26 – the new row that slides in at the top of a list (markup: AddRow.astro). One behaviour for the wine
// rows and the guest rows: the page's "+ Add …" button opens it and is grey while it is open; Enter or the row's
// button adds; Esc and × close – asking "Discard what you have written?" first when a field has text; ↓ goes to the
// first suggestion. Suggestions (the hits) use the one menu's look with a button per hit; one that is already in the
// list gets a disabled "✓ Added" button.
import { confirmModal } from './confirm';
import { iconSvg } from './icons';
import { menuGroup, menuHit } from './menu';
import { fieldError } from '../field-error';
import { t } from '../../i18n';

export interface AddRowOptions {
  /** The id given to AddRow.astro */
  id: string;
  /** The page's "+ Add …" button */
  button: HTMLButtonElement;
  /** The row's fields (the first gets the focus) */
  fields: HTMLInputElement[];
  /** Enter in a field, or the row's add button */
  onSubmit: () => void;
  /** The row's add button (Enter does the same) */
  go?: HTMLButtonElement | null;
  /** Not now (e.g. guests before the tasting has a wine) */
  canOpen?: () => boolean;
  /** Typed into a field: show the suggestions */
  onInput?: () => void;
  /** Closed (the fields are emptied) */
  onClose?: () => void;
  /** More that counts as "written" (an attached link or photo) */
  dirty?: () => boolean;
}

export interface Hit { lead: Node; title: string | HTMLElement; sub?: string | null; action: Node | null }

export function addRow(o: AddRowOptions) {
  const bar = document.getElementById(`${o.id}-bar`)!;
  const row = document.getElementById(`${o.id}-row`)!;
  const hits = document.getElementById(`${o.id}-hits`) as HTMLUListElement;
  const wide = () => matchMedia('(min-width: 48rem)').matches;
  const isOpen = () => bar.classList.contains('open');
  const written = () => o.fields.some((f) => f.value.trim()) || !!o.dirty?.();
  o.button.setAttribute('aria-controls', bar.id);
  o.button.setAttribute('aria-expanded', 'false');

  function open(focus = true) {
    if (o.canOpen && !o.canOpen()) return;
    bar.classList.add('open');
    bar.inert = false;
    o.button.setAttribute('aria-expanded', 'true');
    // The row is open: the button waits until it is closed
    o.button.disabled = true;
    // On phones the keyboard would cover the list: no focus there
    if (focus && wide()) o.fields[0]?.focus({ preventScroll: true });
    if (focus) bar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  /** Closes and empties the row (refocus: back to the page's button) */
  function close(refocus = true) {
    bar.classList.remove('open');
    bar.inert = true;
    o.button.setAttribute('aria-expanded', 'false');
    o.button.disabled = o.canOpen ? !o.canOpen() : false;
    clear();
    o.onClose?.();
    if (refocus) o.button.focus();
  }
  /** × and Esc: asked about first when something is written */
  async function requestClose() {
    if (written()) {
      const ok = await confirmModal({ title: t('addRow.discardQ'), ok: t('sheet.discard'), cancel: t('sheet.keepEditing'), danger: true });
      if (!ok) { o.fields[0]?.focus(); return; }
    }
    close();
  }
  /** Empties the fields and the suggestions (after adding: the row stays open for the next one) */
  function clear() {
    for (const f of o.fields) { f.value = ''; fieldError(f, null); }
    setHits([]);
  }

  o.button.addEventListener('click', () => open());
  document.getElementById(`${o.id}-close`)!.addEventListener('click', requestClose);
  o.go?.addEventListener('click', () => o.onSubmit());
  for (const f of o.fields) {
    f.addEventListener('input', () => o.onInput?.());
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); o.onSubmit(); }
      else if (e.key === 'Escape') { e.preventDefault(); requestClose(); }
      else if (e.key === 'ArrowDown') {
        const first = hits.querySelector<HTMLElement>('button:not(:disabled), a');
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /** The suggestions under the fields: a heading, then a row per hit with its own button */
  function setHits(list: Hit[], head?: string) {
    hits.replaceChildren();
    hits.hidden = !list.length;
    if (!list.length) return;
    if (head) hits.append(menuGroup(head, 'li'));
    for (const h of list) hits.append(menuHit(h.lead, h.title, h.sub ?? null, h.action));
  }

  /** An error under the row's fields */
  const error = (field: HTMLInputElement, text: string | null) => fieldError(field, text, field.closest('.ar-fields') ?? field.closest('div.input') ?? field);

  return { open, close, requestClose, clear, isOpen, setHits, error, row, bar };
}

/** A hit's button: "Add" (or what it does) – or, when it is already in the list, a disabled "✓ Added" */
export function hitButton(label: string, run: (b: HTMLButtonElement) => void, already = false, alreadyLabel = t('qa.alreadyHere')): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn small secondary';
  if (already) {
    b.disabled = true;
    b.innerHTML = iconSvg('check');
    b.append(alreadyLabel);
  } else {
    b.textContent = label;
    b.addEventListener('click', () => run(b));
  }
  return b;
}
