// Shared site settings.
// The Supabase key is the public "publishable" key, so it is safe to keep here.
// Data access is controlled by the policies in supabase/schema.sql and supabase/migrations.

export const SUPABASE_URL = 'https://ydvdhhdpygzwalosbjcc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_J1p_UQdBFtKyEiT57AlZ2Q_2f9t38XC';

export const EVENT = {
  title: 'Portvin 2026',
  dateLong: 'Lørdag den 21. november 2026',
  time: 'kl. 17',
  // Empty string = not shown.
  place: 'Gl. Holte Gade 31, 2840 Holte',
  // Fallback MobilePay number. Empty string = "the host will tell you how".
  mobilepay: '53884312',
};
