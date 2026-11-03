// Component 30 – side panel (<dialog class="sheet">): editing always happens here. Static markup: Sheet.astro;
// sheet() builds the same markup in TypeScript. sheetPanel() wires it up and asks "Discard changes?" (the one
// confirmation) before closing with unsaved edits.
import { confirmModal } from './confirm';
import { closeButton } from './icon-button';
import { t } from '../../i18n';

export interface SheetMarkup {
  id: string; title: string; wide?: boolean;
  /** A <form> around body and foot (its submit button saves) */
  form?: boolean;
  body?: Node[];
  /** The quiet delete, last in the body */
  quiet?: Node[];
  /** The primary button(s); "Cancel" follows unless cancel is false */
  foot?: Node[];
  cancel?: boolean;
}

/** The same markup as Sheet.astro: head (title, ×), body (scrolls), foot (primary first, then Cancel). Appended to body. */
export function sheet(o: SheetMarkup): { dialog: HTMLDialogElement; body: HTMLElement; foot: HTMLElement | null; form: HTMLFormElement | null; title: HTMLElement } {
  const dialog = document.createElement('dialog');
  dialog.id = o.id;
  dialog.className = 'sheet' + (o.wide ? ' wide' : '');
  dialog.setAttribute('aria-labelledby', `${o.id}-title`);
  const grab = Object.assign(document.createElement('div'), { className: 'sh-grab' });
  grab.setAttribute('aria-hidden', 'true');
  const head = Object.assign(document.createElement('div'), { className: 'sh-head' });
  const title = Object.assign(document.createElement('h2'), { id: `${o.id}-title`, textContent: o.title });
  const x = closeButton();
  x.dataset.close = '';
  head.append(title, x);
  const wrap = document.createElement(o.form ? 'form' : 'div');
  wrap.className = 'sh-form';
  if (o.form) (wrap as HTMLFormElement).noValidate = true;
  const body = Object.assign(document.createElement('div'), { className: 'sh-body' });
  body.append(...(o.body ?? []));
  if (o.quiet?.length) { const q = Object.assign(document.createElement('div'), { className: 'sh-quiet' }); q.append(...o.quiet); body.append(q); }
  wrap.append(body);
  let foot: HTMLElement | null = null;
  if (o.foot?.length) {
    foot = Object.assign(document.createElement('div'), { className: 'sh-foot' });
    const row = Object.assign(document.createElement('div'), { className: 'actions' });
    row.append(...o.foot);
    if (o.cancel !== false) {
      const c = Object.assign(document.createElement('button'), { type: 'button', className: 'btn secondary', textContent: t('common.cancel') });
      c.dataset.close = '';
      row.append(c);
    }
    foot.append(row);
    wrap.append(foot);
  }
  dialog.append(grab, head, wrap);
  document.body.append(dialog);
  return { dialog, body, foot, form: o.form ? (wrap as HTMLFormElement) : null, title };
}

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
  // × and "Cancel" (data-close) – also ones put in later
  dialog.addEventListener('click', (e) => {
    if ((e.target as Element).closest?.('[data-close]')) { e.preventDefault(); requestClose(); return; }
    // A click on the backdrop lands on the dialog element itself
    if (e.target === dialog) requestClose();
  });
  // Escape: asked about first too
  dialog.addEventListener('cancel', (e) => { if (isDirty()) { e.preventDefault(); requestClose(); } });
  dialog.addEventListener('close', () => o.onClose?.());
  return {
    open() {
      dialog.showModal();
      dialog.querySelector('.sh-body')?.scrollTo(0, 0);
      // The dialog puts the focus on ×, which would show its tip: start on the heading instead (fields are focused by the page)
      const h = dialog.querySelector<HTMLElement>('.sh-head h2');
      if (h && (document.activeElement as Element | null)?.closest('[data-close]')) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      initial = formSnapshot(dialog); touched = false;
    },
    /** The fields as they are now count as unchanged (e.g. after saving part of it) */
    markClean() { initial = formSnapshot(dialog); touched = false; },
    /** Whether the person has changed a field since the panel opened */
    changed,
    close() { if (dialog.open) dialog.close(); },
    requestClose,
  };
}
