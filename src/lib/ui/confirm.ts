// Component 31 – confirmation: the ONLY way the site asks before doing something ("Delete the tasting?",
// "Discard changes?"). A small window with the question, one line on what happens, Cancel and the button that says
// what happens ("Delete the tasting", never "OK"). Focus starts on Cancel; the action is last (right); on phones the
// buttons stack with the action on top. Resolves true when the action is chosen.
import { t } from '../../i18n';

export interface ConfirmOptions {
  title: string;
  text?: string;
  /** The action's label */
  ok: string;
  /** Red action (deleting, discarding) */
  danger?: boolean;
  cancel?: string;
}

export function confirmModal(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    const id = `cf-${Math.random().toString(36).slice(2, 8)}`;
    const q = Object.assign(document.createElement('p'), { className: 'cf-q', id: `${id}-q`, textContent: o.title });
    dlg.setAttribute('aria-labelledby', q.id);
    dlg.append(q);
    if (o.text) {
      const n = Object.assign(document.createElement('p'), { className: 'cf-t', id: `${id}-t`, textContent: o.text });
      dlg.setAttribute('aria-describedby', n.id);
      dlg.append(n);
    }
    const row = document.createElement('div');
    row.className = 'actions stack';
    const no = Object.assign(document.createElement('button'), { type: 'button', className: 'btn secondary', textContent: o.cancel ?? t('common.cancel') });
    const ok = Object.assign(document.createElement('button'), { type: 'button', className: 'btn' + (o.danger ? ' danger' : ''), textContent: o.ok });
    row.append(no, ok);
    dlg.append(row);
    let answer = false;
    no.addEventListener('click', () => dlg.close());
    ok.addEventListener('click', () => { answer = true; dlg.close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(answer); });
    // Inside an open dialog it would sit under it: the top layer stacks in order of opening, so body is fine
    document.body.append(dlg);
    dlg.showModal();
    no.focus();
  });
}
