// Shared by the host's admin pages: sign-in check, host record and small DOM helpers.
import { supabase } from './supabase';
import { parseAmount } from './wine-validate';
import { i18nReady, t } from '../i18n';
import { initSide, currentAdmin, tastingRoles } from './admin-side';
import { storedWorkspace, rememberWorkspace, setCurrentWorkspace, type Workspace } from './workspace';
import { linkMe, takeCohostWelcome } from './link-me';

/** The signed-in host, with the account (tenant) the admin shows and whether they own it, and all their accounts */
export type Host = { id: string; email: string; name: string | null; language: string; mobilepay: string | null;
  tenant_id: string; tenant_owner: boolean; workspaces: Workspace[] };

export { $, mk } from './ui/dom';
import { $, mk } from './ui/dom';

export { iconButton, closeButton, editButton, adminLink, setEditWhat, type IconName } from './icons';
import { closeButton } from './ui/icon-button';

async function signOut() {
  await supabase.auth.signOut();
  location.href = '/';
}

/**
 * Makes sure a host is signed in. Without a session → the sign-in page (and back here);
 * signed in but not a host → the notice in AdminNav. Returns the host, or null.
 */
export async function requireHost(): Promise<Host | null> {
  await i18nReady;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    location.replace('/login/?next=' + encodeURIComponent(location.pathname + location.search));
    return null;
  }
  $('logout2')?.addEventListener('click', signOut);

  // Turns a co-host invitation for this email into a host account (first sign-in)
  await linkMe();
  const { data: hostId } = await supabase.rpc('current_host_id');
  if (!hostId) { $('not-host').hidden = false; return null; }
  // My accounts (a host removed from their last account gets a new one of their own here)
  const [{ data: host }, { data: list }] = await Promise.all([
    supabase.from('hosts').select('id, email, name, language, mobilepay').eq('id', hostId).single(),
    supabase.rpc('my_workspaces'),
  ]);
  const workspaces = (list ?? []) as Workspace[];
  if (!host || !workspaces.length) { $('not-host').hidden = false; return null; }
  const ws = await pickWorkspace(workspaces);
  setCurrentWorkspace(ws.id);
  if (workspaces.length > 1) rememberWorkspace(ws.id);

  initSide(data.session.user.email ?? '', signOut, workspaces);
  enableImageZoom(t('admin.close'));
  showCohostWelcome();
  return { ...host, tenant_id: ws.id, tenant_owner: ws.role === 'owner', workspaces } as Host;
}

/**
 * The account the admin shows: the one a link names (?ws=, from an invitation), else the account of the tasting
 * that is open, else the one chosen last on this device, else the default one. Only ever one of my own.
 */
async function pickWorkspace(list: Workspace[]): Promise<Workspace> {
  const mine = (id: string | null | undefined) => list.find((w) => w.id === id);
  const params = new URLSearchParams(location.search);
  const asked = mine(params.get('ws'));
  if (params.has('ws')) {
    params.delete('ws');
    history.replaceState(null, '', location.pathname + (params.size ? '?' + params : '') + location.hash);
  }
  if (asked) return asked;
  const here = currentAdmin();
  if (here && list.length > 1) {
    const role = (await tastingRoles()).find((r) => r.slug === here.slug);
    if (role && !role.shared && mine(role.tenant_id)) return mine(role.tenant_id)!;
  }
  return mine(storedWorkspace()) ?? list.find((w) => w.is_default) ?? list[0];
}

/** A typed amount: "144,95", "144.95", "1.234,50" or "149 kr." – null when empty or not a number. */
export const toNumber = (v: string) => {
  const n = parseAmount(v);
  return n == null || Number.isNaN(n) ? null : n;
};

/**
 * Click a wine thumbnail (or the photo preview) to see it large. One shared <dialog>;
 * closes on click, the close button or Escape.
 */
export function enableImageZoom(closeLabel: string) {
  let dialog = document.getElementById('zoom') as HTMLDialogElement | null;
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'zoom';
    dialog.className = 'zoom';
    const img = document.createElement('img');
    img.alt = '';
    const close = closeButton(closeLabel);
    close.classList.add('lg');
    dialog.append(img, close);
    document.body.append(dialog);
    dialog.addEventListener('click', () => dialog!.close());
  }
  document.addEventListener('click', (e) => {
    const img = (e.target as HTMLElement).closest('.thumb > img, #wf-preview') as HTMLImageElement | null;
    if (!img || !img.src || img.hidden) return;
    e.preventDefault();
    const big = dialog!.querySelector('img')!;
    big.src = img.src;
    big.alt = img.alt;
    dialog!.showModal();
  });
}

export { sheetPanel, formSnapshot, type SheetOptions } from './ui/sheet';

/** One time, right after the sign-in that made me co-host: "You are now co-host of Portvin 2026." */
function showCohostWelcome() {
  const rows = takeCohostWelcome();
  if (!rows.length) return;
  const here = location.pathname.match(/^\/t\/([a-z0-9-]+)\/admin\//)?.[1];
  // The one small dialog (component 31's look): the heading, a line per tasting, the buttons right with the primary last
  const dlg = document.createElement('dialog');
  dlg.className = 'confirm';
  dlg.setAttribute('aria-labelledby', 'welcome-title');
  dlg.append(Object.assign(mk('p', 'cf-q', t('cohost.welcomeTitle')), { id: 'welcome-title' }));
  for (const r of rows) dlg.append(mk('p', 'cf-t', t('cohost.welcomeText', { tasting: r.title })));
  const actions = mk('div', 'actions stack');
  const other = rows.find((r) => r.slug !== here);
  const ok = mk('button', rows.length === 1 && other ? 'btn secondary' : 'btn', t('cohost.ok'));
  ok.type = 'button';
  ok.addEventListener('click', () => dlg.close());
  actions.append(ok);
  if (rows.length === 1 && other) {
    const go = mk('a', 'btn', t('cohost.goTo'));
    go.href = `/t/${other.slug}/admin/`;
    actions.append(go);
  }
  dlg.append(actions);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
}
