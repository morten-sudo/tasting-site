// Component 28 – deleting with Undo, everywhere: asked about first (confirmModal), the row goes, a toast says so with
// "Undo" (8 s), and the deletion is only done when the toast closes – or, when the page is left before that, with
// ONE shared pagehide that sends the deletions with keepalive.
import { confirmModal, type ConfirmOptions } from './confirm';
import { toast } from './toast';
import { supabase } from '../supabase';
import { SUPABASE_URL, SUPABASE_KEY } from '../config';
import { t } from '../../i18n';

export interface DeleteOptions {
  /** The row that goes (put back in its place on Undo) – or leave it out and use hide/restore */
  row?: HTMLElement | null;
  /** The toast: "Kopke Fine White is removed" */
  label: string;
  /** The question first (the action is red) */
  ask?: Omit<ConfirmOptions, 'danger'> | null;
  /** Deletes for real; false (or an error) puts the row back and says so */
  commit: () => Promise<boolean>;
  /** The same deletion as REST paths ("participants?id=eq.…") for when the page is left before the toast closes */
  keepalive?: string[];
  /** The page's own bookkeeping: take it out of the data and render (instead of / as well as row) … */
  hide?: () => void;
  /** … and back again on Undo or when the deletion failed */
  restore?: () => void;
  /** Said after Undo */
  restored?: string;
  /** Said when the deletion failed */
  failed?: string;
  ms?: number;
}

// The deletions waiting for their toast to close
const pending = new Map<number, { paths: string[]; token: string }>();
let wired = false;
let n = 0;
function wire() {
  if (wired) return;
  wired = true;
  addEventListener('pagehide', () => {
    for (const { paths, token } of pending.values()) {
      for (const path of paths) {
        fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', keepalive: true,
          headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token || SUPABASE_KEY}` } });
      }
    }
    pending.clear();
  });
}

/** Resolves true when the row went (the deletion is then on its way), false when the question was answered no. */
export async function deleteWithUndo(o: DeleteOptions): Promise<boolean> {
  if (o.ask && !(await confirmModal({ ...o.ask, danger: true }))) return false;
  wire();
  const key = ++n;
  const { data } = await supabase.auth.getSession();
  pending.set(key, { paths: o.keepalive ?? [], token: data.session?.access_token ?? '' });
  // Out of view, remembering where it was
  const row = o.row ?? null;
  const parent = row?.parentNode ?? null;
  const next = row?.nextSibling ?? null;
  row?.remove();
  o.hide?.();
  const putBack = () => {
    if (row && parent && !row.isConnected) parent.insertBefore(row, next && next.parentNode === parent ? next : null);
    o.restore?.();
  };
  toast(o.label, {
    duration: o.ms,
    action: { label: t('wineLib.undo'), run: () => {
      pending.delete(key);
      putBack();
      if (o.restored) toast(o.restored, { kind: 'ok' });
    } },
    onTimeout: async () => {
      if (!pending.delete(key)) return;
      let ok = false;
      try { ok = await o.commit(); } catch { ok = false; }
      if (!ok) { putBack(); toast(o.failed ?? t('admin.changeNotSaved'), { kind: 'error' }); }
    },
  });
  return true;
}
