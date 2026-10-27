// Fælles indstillinger for sitet.
// Supabase-nøglen er den offentlige "publishable" nøgle – den må gerne ligge her.
// Adgang til data styres af reglerne i supabase/schema.sql.

export const SUPABASE_URL = 'https://ydvdhhdpygzwalosbjcc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_J1p_UQdBFtKyEiT57AlZ2Q_2f9t38XC';

export const EVENT = {
  title: 'Portvin 2026',
  dateLong: 'Lørdag den 21. november 2026',
  time: 'kl. 17',
  // Udfyldes, når adressen er på plads. Tom tekst = vises ikke.
  place: '',
};
