import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STORAGE_KEY = 'guest_code';

// The guest's invite code: from the link (?k=...) or remembered from last time.
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

// Sign out: forget the code and end any email session on this device
export function forgetGuestCode() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  try {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    localStorage.removeItem(`sb-${ref}-auth-token`);
  } catch {}
  supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}
