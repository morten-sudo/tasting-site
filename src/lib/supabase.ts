import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

// "Remember me" (the login page): remembered, the session is kept in localStorage and lasts until signing out;
// not remembered, it is kept in sessionStorage and ends when the browser is closed.
const REMEMBER = 'wt-remember';
const LAST_EMAIL = 'wt-last-email';
const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };

export const rememberMe = () => safe(() => localStorage.getItem(REMEMBER)) !== '0';
export function setRememberMe(on: boolean, email?: string) {
  safe(() => {
    if (on) {
      localStorage.removeItem(REMEMBER);
      if (email) localStorage.setItem(LAST_EMAIL, email);
    } else {
      localStorage.setItem(REMEMBER, '0');
      localStorage.removeItem(LAST_EMAIL);
    }
  });
}
/** The email used last time on this device (only when remembered). */
export const lastEmail = () => (rememberMe() ? safe(() => localStorage.getItem(LAST_EMAIL)) : null);

const storage = {
  getItem: (key: string) => safe(() => sessionStorage.getItem(key)) ?? safe(() => localStorage.getItem(key)),
  setItem: (key: string, value: string) => {
    const [keep, drop] = rememberMe() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    safe(() => keep.setItem(key, value));
    safe(() => drop.removeItem(key));
  },
  removeItem: (key: string) => { safe(() => localStorage.removeItem(key)); safe(() => sessionStorage.removeItem(key)); },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storage, persistSession: true } });
