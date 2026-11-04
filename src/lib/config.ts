// Shared site settings.
// The Supabase key is the public "publishable" key, so it is safe to keep here.
// Data access is controlled by the policies in supabase/schema.sql and supabase/migrations.

// Two databases: the live one (winetastr.com, the main branch) and the test one (every other branch's preview
// address on Cloudflare Pages). scripts/db-target.mjs sets DB_TARGET at build time; see "Releases" in CLAUDE.md.
import { DB_TARGET } from './db-target';

const DATABASES = {
  live: { url: 'https://ydvdhhdpygzwalosbjcc.supabase.co', key: 'sb_publishable_J1p_UQdBFtKyEiT57AlZ2Q_2f9t38XC' },
  test: { url: 'https://piiuhgzsnphhuceojldz.supabase.co', key: 'sb_publishable_fgw-aZhF7pXyTjdG-AgDjg_Pfqd_SIW' },
} as const;

export const IS_TEST = DB_TARGET === 'test';
export const SUPABASE_URL = DATABASES[DB_TARGET].url;
export const SUPABASE_KEY = DATABASES[DB_TARGET].key;

export const SITE_NAME = 'Winetastr';
