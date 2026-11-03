// Component 30 – side panel (<dialog class="sheet">): editing always happens here. sheetPanel() wires it up and asks
// "Discard changes?" (the one confirmation) before closing with unsaved edits.
import { confirmModal } from './confirm';
import { t } from '../../i18n';

/**
 * A side panel (<dialog class="sheet">): editing always happens here – from the right on larger
 * screens, from the bottom on phones. Closes with its × button, Escape or a click beside it – and when something
 * has been changed (dirty() says so) it asks "Discard changes?" first (the one confirmation).
 * close() (after saving) closes without asking; requestClose() asks when needed.
 */
export interface SheetOptions { onClose?: () => void; dirty?: (() => boolean) | 'form' }

/** What the fields in root hold now (inputs, text areas, dropdowns, switches) – to tell whether anything was changed */
export function formSnapshot(root: ParentNode): string {
  const parts: string[] = [];
  root.querySelectorAll<HTMLElement>('input, textarea, select, output, .dd[data-dd]').forEach((el) => {
    if (el.closest('.dd[data-dd]') && !el.matches('.dd[data-dd]')) return;
    if (el.tagName === 'OUTPUT') { parts.push(el.textContent ?? ''); return; }
    const i = el as HTMLInputElement;
    if (i.type === 'file' || i.type === 'search' || i.type === 'hidden') return;
    parts.push(i.type === 'checkbox' || i.type === 'radio' ? String(i.checked) : String((el as HTMLInputElement).value ?? ''));
  });
  return parts.join('\u0001');
}

export function sheetPanel(dialog: HTMLDialogElement, opts: SheetOptions | (() => void) = {}) {
  const o: SheetOptions = typeof opts === 'function' ? { onClose: opts } : opts;
  let asking = false;
  // 'form': changed when the fields differ from what they held when the panel opened
  // Only what the person did counts: fields the page fills in by itself (a lookup) do not make it "changed"
  let initial = '';
  let touched = false;
  for (const ev of ['keydown', 'pointerdown', 'paste', 'drop']) {
    dialog.addEventListener(ev, (e) => { if (e.isTrusted && e.target !== dialog && !(e.target as Element).closest?.('[data-close]')) touched = true; }, true);
  }
  const changed = () => touched && formSnapshot(dialog) !== initial;
  const isDirty = () => (o.dirty === 'form' ? changed() : !!o.dirty?.());
  async function requestClose() {
    if (!dialog.open || asking) return;
    if (isDirty()) {
      asking = true;
      const ok = await confirmModal({ title: t('sheet.discardQ'), text: t('sheet.discardText'), ok: t('sheet.discard'), cancel: t('sheet.keepEditing'), danger: true });
      asking = false;
      if (!ok) return;
    }
    dialog.close();
  }
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); requestClose(); }));
  // A click on the backdrop lands on the dialog element itself
  dialog.addEventListener('click', (e) => { if (e.target === dialog) requestClose(); });
  // Escape: asked about first too
  dialog.addEventListener('cancel', (e) => { if (isDirty()) { e.preventDefault(); requestClose(); } });
  dialog.addEventListener('close', () => o.onClose?.());
  return {
    open() { dialog.showModal(); dialog.scrollTop = 0; initial = formSnapshot(dialog); touched = false; },
    /** The fields as they are now count as unchanged (e.g. after saving part of it) */
    markClean() { initial = formSnapshot(dialog); touched = false; },
    /** Whether the person has changed a field since the panel opened */
    changed,
    close() { if (dialog.open) dialog.close(); },
    requestClose,
  };
}
