// A question in a small window ("Remove Anna as host?") with Cancel and a red Yes – instead of the browser's
// confirm() or "press again". Resolves true when the host says yes.
import { t } from '../i18n';

export function confirmModal(question: string, yes: string, note = ''): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm-modal';
    const q = document.createElement('p');
    q.className = 'td-q';
    q.id = `cq-${Math.random().toString(36).slice(2, 8)}`;
    q.textContent = question;
    dlg.setAttribute('aria-labelledby', q.id);
    dlg.append(q);
    if (note) { const n = document.createElement('p'); n.className = 'hint'; n.textContent = note; dlg.append(n); }
    const row = document.createElement('div');
    row.className = 'row-actions';
    const no = Object.assign(document.createElement('button'), { type: 'button', className: 'btn small ghost', textContent: t('common.cancel') });
    const ok = Object.assign(document.createElement('button'), { type: 'button', className: 'btn small danger', textContent: yes });
    row.append(no, ok);
    dlg.append(row);
    let answer = false;
    no.addEventListener('click', () => dlg.close());
    ok.addEventListener('click', () => { answer = true; dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(answer); });
    (document.querySelector('.admin-page') ?? document.body).append(dlg);
    dlg.showModal();
    no.focus();
  });
}
