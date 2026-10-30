// Shared by the host's admin pages: sign-in check, host record and small DOM helpers.
import { supabase } from './supabase';
import { i18nReady } from '../i18n';

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
  $('logout')?.addEventListener('click', signOut);

  const { data: hostId } = await supabase.rpc('current_host_id');
  if (!hostId) { $('not-host').hidden = false; return null; }
  const { data: host } = await supabase.from('hosts').select('id, email, name, language, mobilepay').eq('id', hostId).single();
  if (!host) { $('not-host').hidden = false; return null; }

  $('me').textContent = data.session.user.email ?? '';
  $('admin-top').hidden = false;
  return host as Host;
}

export const toNumber = (v: string) => {
  const n = Number(v.replace(',', '.').trim());
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};
