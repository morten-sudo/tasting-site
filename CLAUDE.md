# Winetastr – notes for working in this repo

- Code, file names, routes and comments in English. The UI is Danish, English and Icelandic (`src/i18n`).
- Astro static site on Cloudflare Pages (auto-deploys from `main`); Pages Functions in `functions/api/`.
- Supabase: access is enforced in the database (RLS for hosts, security-definer RPCs keyed by invite code for guests).
  Keep a copy of every applied migration in `supabase/migrations/`.
- After every database change, run `supabase/tests/security.sql` (it rolls back) and expect `security test passed`.
  It is too long for some tools in one go: `node scripts/security-parts.mjs` writes it as three parts in
  `supabase/tests/parts/` (each rolls back on its own); run them one after the other and expect `security part N passed`.
  When a section is added to security.sql, add its heading to a part in the script.
- UX rule: a list shows, the side panel edits. Rows in a list are read-only (what it is, its status as small chips,
  an "Edit" button); every setting – also ones that save straight away – lives in the side panel from the right
  (`<dialog class="sheet">`, bottom sheet on phones, `sheetPanel()` from `src/lib/admin-common.ts`). No form fields inside lists.
  Feedback: errors under the field (`fieldError()`), a toast after saving or deleting (`toast()`), deleting with Undo.
- One pattern per kind of control: one choice among a few = choice cards (`.choice-cards`: radio, name, one line on
  what it means); on/off = a switch (`.set-switch`); a row's actions = icons with a tip (`iconButton()`), removing an
  item = a quiet trash icon, asked about first; adding to a list = a new row that slides in at the top of the list.
- **Good UX only – nothing else gets through.** Every change to a page passes this gate before it is shown to Morten
  or pushed to `main`:
  1. Screenshot the whole page (not only the new part) with realistic data – 10+ wines, 20+ guests – on a phone and
     a large screen, and look at it as a host who uses it for the first time.
  2. Check it against the rules above: list shows / panel edits, no form fields in lists, clear button hierarchy
     (one primary action), destructive actions quiet and asked about, errors under the field, a toast after saving,
     empty states with a way forward, plain words, the same pattern as the rest of the admin.
  3. Anything I would criticise if someone else had built it is fixed first. Never propose, show or ship something
     that is "good enough for now" – if a page next to the change is also below standard, say so and fix it.
  4. When something is wrong, it is fixed – not offered as a suggestion.
- **Components.** All UI is built from the shared components: static markup from `src/components/ui/*.astro`, DOM built
  in TypeScript from `src/lib/ui/*.ts` (both give the same markup); their CSS lives only in `src/styles/components.css`
  (`global.css` = base and page layout, `admin.css` = the admin's page layout, page `<style>` = that page's layout only).
  A component that is missing is added there first and shown in all its states on `/dev/components/` – never built as a
  one-off on a page. `scripts/check-ui.mjs` runs before every build (`npm run build`, also `npm run check:ui`) and must
  pass: no native `<select>`, no `alert/confirm/prompt`, no `style=""`, no old class names, no form fields in list rows,
  side panels only through `Sheet.astro`/`sheet()`, no other CSS files.
- Help: every new feature or change for hosts updates the help in the same commit – `src/lib/help-content.ts`
  (sections in Danish and English; link each step to its place with `t:<section>/…`, `?open=<button id>` or `#<id>`)
  and, for a setting that needs explaining, a `?` tip (`data-help="<key>"` + an entry in `TIPS`).
