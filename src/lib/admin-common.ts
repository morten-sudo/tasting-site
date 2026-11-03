// Shared by the host's admin pages: sign-in check, host record and small DOM helpers.
import { supabase } from './supabase';
import { parseAmount } from './wine-validate';
import { i18nReady, t } from '../i18n';
import { initSide } from './admin-side';
import { linkMe, takeCohostWelcome } from './link-me';

/** The signed-in host, with their account (tenant) and whether they own it */
export type Host = { id: string; email: string; name: string | null; language: string; mobilepay: string | null;
  tenant_id: string; tenant_owner: boolean };

export const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

export function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export { iconButton, closeButton, type IconName } from './icons';
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
  // A host removed from an account gets a new account of their own here
  const [{ data: host }, { data: tenantId }] = await Promise.all([
    supabase.from('hosts').select('id, email, name, language, mobilepay').eq('id', hostId).single(),
    supabase.rpc('ensure_my_tenant'),
  ]);
  if (!host || !tenantId) { $('not-host').hidden = false; return null; }
  const { data: tenant } = await supabase.from('tenants').select('owner_id').eq('id', tenantId).maybeSingle();

  initSide(data.session.user.email ?? '', signOut);
  enableImageZoom(t('admin.close'));
  showCohostWelcome();
  return { ...host, tenant_id: tenantId as string, tenant_owner: (tenant as { owner_id: string } | null)?.owner_id === host.id } as Host;
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
  const dlg = document.createElement('dialog');
  dlg.className = 'welcome-modal';
  dlg.setAttribute('aria-labelledby', 'welcome-title');
  dlg.append(mk('p', 'welcome-icon', '🍷'), Object.assign(mk('h2', '', t('cohost.welcomeTitle')), { id: 'welcome-title' }));
  for (const r of rows) dlg.append(mk('p', 'welcome-text', t('cohost.welcomeText', { tasting: r.title })));
  const actions = mk('div', 'actions end');
  const other = rows.find((r) => r.slug !== here);
  // A dialog: the primary action last (on the right)
  const ok = mk('button', rows.length === 1 && other ? 'btn small secondary' : 'btn small', t('cohost.ok'));
  ok.type = 'button';
  ok.addEventListener('click', () => dlg.close());
  actions.append(ok);
  if (rows.length === 1 && other) {
    const go = mk('a', 'btn small', t('cohost.goTo'));
    go.href = `/t/${other.slug}/admin/`;
    actions.append(go);
  }
  dlg.append(actions);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
}
