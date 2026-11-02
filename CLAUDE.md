# Winetastr – notes for working in this repo

- Code, file names, routes and comments in English. The UI is Danish, English and Icelandic (`src/i18n`).
- Astro static site on Cloudflare Pages (auto-deploys from `main`); Pages Functions in `functions/api/`.
- Supabase: access is enforced in the database (RLS for hosts, security-definer RPCs keyed by invite code for guests).
  Keep a copy of every applied migration in `supabase/migrations/`.
- After every database change, run `supabase/tests/security.sql` (it rolls back) and expect `security test passed`.
- UX rule: a list shows, the side panel edits. Rows in a list are read-only (what it is, its status as small chips,
  an "Edit" button); every setting – also ones that save straight away – lives in the side panel from the right
  (`<dialog class="sheet">`, bottom sheet on phones, `sheetPanel()` from `src/lib/admin-common.ts`). No form fields inside lists.
  Feedback: errors under the field (`fieldError()`), a toast after saving or deleting (`toast()`), deleting with Undo.
- Before shipping a page change: look at the whole page with realistic data (10+ wines, 20+ guests) on a phone and a
  large screen, not only at the new part.
- Help: every new feature or change for hosts updates the help in the same commit – `src/lib/help-content.ts`
  (sections in Danish and English; link each step to its place with `t:<section>/…`, `?open=<button id>` or `#<id>`)
  and, for a setting that needs explaining, a `?` tip (`data-help="<key>"` + an entry in `TIPS`).
