// Shared by the host's admin pages: sign-in check, host record and small DOM helpers.
import { supabase } from './supabase';
import { i18nReady, t } from '../i18n';
import { initSide } from './admin-side';

export type Host = { id: string; email: string; name: string | null; language: string; mobilepay: string | null };

export const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

export function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

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
  $('side-logout')?.addEventListener('click', signOut);

  // Turns a co-host invitation for this email into a host account (first sign-in)
  await supabase.rpc('link_me');
  const { data: hostId } = await supabase.rpc('current_host_id');
  if (!hostId) { $('not-host').hidden = false; return null; }
  const { data: host } = await supabase.from('hosts').select('id, email, name, language, mobilepay').eq('id', hostId).single();
  if (!host) { $('not-host').hidden = false; return null; }

  $('me').textContent = data.session.user.email ?? '';
  initSide(host.id);
  enableImageZoom(t('admin.close'));
  return host as Host;
}

export const toNumber = (v: string) => {
  const n = Number(v.replace(',', '.').trim());
  return v.trim() === '' || Number.isNaN(n) ? null : n;
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
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'zoom-close';
    close.textContent = '×';
    close.setAttribute('aria-label', closeLabel);
    dialog.append(img, close);
    document.body.append(dialog);
    dialog.addEventListener('click', () => dialog!.close());
  }
  document.addEventListener('click', (e) => {
    const img = (e.target as HTMLElement).closest('.wine-thumb img, #wf-preview') as HTMLImageElement | null;
    if (!img || !img.src || img.hidden) return;
    e.preventDefault();
    const big = dialog!.querySelector('img')!;
    big.src = img.src;
    big.alt = img.alt;
    dialog!.showModal();
  });
}
