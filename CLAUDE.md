# Winetastr – notes for working in this repo

- Code, file names, routes and comments in English. The UI is Danish, English and Icelandic (`src/i18n`).
- Astro static site on Cloudflare Pages (auto-deploys from `main`); Pages Functions in `functions/api/`.
- Supabase: access is enforced in the database (RLS for hosts, security-definer RPCs keyed by invite code for guests).
  Keep a copy of every applied migration in `supabase/migrations/`.
- After every database change, run `supabase/tests/security.sql` (it rolls back) and expect `security test passed`.
- UX rule: editing (an "Edit" button) always opens a side panel from the right (`<dialog class="sheet">`, bottom sheet on phones) – use `sheetPanel()` from `src/lib/admin-common.ts`, never an inline form.
- Help: every new feature or change for hosts updates the help in the same commit – `src/lib/help-content.ts`
  (sections in Danish and English; link each step to its place with `t:<section>/…`, `?open=<button id>` or `#<id>`)
  and, for a setting that needs explaining, a `?` tip (`data-help="<key>"` + an entry in `TIPS`).
