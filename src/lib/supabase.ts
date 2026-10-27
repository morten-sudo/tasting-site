import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STORAGE_KEY = 'portvin_kode';

// Gæstens invitationskode: fra linket (?k=...) eller husket fra sidst.
export function getGuestCode(): string | null {
  const fromUrl = new URLSearchParams(location.search).get('k')?.trim();
  if (fromUrl) {
    try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch {}
    return fromUrl;
  }
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function setGuestCode(code: string) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch {}
}

export function forgetGuestCode() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
