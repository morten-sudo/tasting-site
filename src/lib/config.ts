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

// Two addresses for the same build (WIN-195): the front page and its public pages on the site address, everything
// you sign in to on the app address. Which pair follows the database: the live build (main) is winetastr.com /
// app.winetastr.com, every test build test.winetastr.com / test-app.winetastr.com. On any other address (a branch's
// *.pages.dev preview, localhost) both halves are the same origin – see src/lib/hosts.ts.
const ORIGINS = {
  live: { site: 'https://winetastr.com', app: 'https://app.winetastr.com' },
  test: { site: 'https://test.winetastr.com', app: 'https://test-app.winetastr.com' },
} as const;
export const SITE_ORIGIN = ORIGINS[DB_TARGET].site;
export const APP_ORIGIN = ORIGINS[DB_TARGET].app;
