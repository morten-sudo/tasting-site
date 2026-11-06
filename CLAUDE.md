# Winetastr – notes for working in this repo

- Code, file names, routes and comments in English. The UI is Danish, English and Icelandic (`src/i18n`).
- Astro static site on Cloudflare Pages (auto-deploys from `main`); Pages Functions in `functions/api/`.
- Supabase: access is enforced in the database (RLS for hosts, security-definer RPCs keyed by invite code for guests).
  Keep a copy of every applied migration in `supabase/migrations/`.
- After every database change, run `supabase/tests/security.sql` (it rolls back) and expect `security test passed`.
  It is too long for some tools in one go: `node scripts/security-parts.mjs` writes it as parts (now five) in
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
  A component that is missing is added there first and shown in all its states on `/superadmin/dev/components/` – never built as a
  one-off on a page. `scripts/check-ui.mjs` runs before every build (`npm run build`, also `npm run check:ui`) and must
  pass: no native `<select>`, no `alert/confirm/prompt`, no `style=""`, no old class names, no form fields in list rows,
  side panels only through `Sheet.astro`/`sheet()`, no other CSS files.
- Help: every new feature or change for hosts updates the help in the same commit – `src/lib/help-content.ts`
  (sections in Danish and English; link each step to its place with `t:<section>/…`, `?open=<button id>` or `#<id>`)
  and, for a setting that needs explaining, a `?` tip (`data-help="<key>"` + an entry in `TIPS`).

## Work and requirements: claude/work (Projects)

- Work, requirements, decisions and status live in the Project files under `claude/work/`. Read
  `claude/work/README.md` for the rules. Jira and Discovery are no longer used: do not read or write them.
  `claude/roadmap.md` and `claude/jira-workflow.md` are archives. Background is in Confluence (space WT), read only.
- `claude/work/INDEX.md` lists every open issue with its status; status is changed only there. Each epic has one file
  (`claude/work/WIN-<nr>-<name>.md`) with requirements, test cases and comments. Read only INDEX.md and the one epic
  file you need. Read a file right before changing it (other chats write the same files) and write it back whole.
- Requirements, success criteria and test cases are written by the product chat and approved by Morten. Build what
  the issue says. If a requirement is wrong, missing or conflicts with something, write a comment under the issue and
  stop that part. Do not change the requirements yourself.
- Next work: issues in INDEX.md with status To Do and Klar = ja, in the order listed, with nothing under "Venter på".
- Grooming: an issue you have reviewed goes to Open, with one comment on what is missing (verdict, gaps, questions,
  blockers, size). The product chat moves it back to To Do when the gaps are closed.
- If Morten asks for something directly, add the issue first (next number from the top of INDEX.md), with Klar = ja.
  New features get For hvem, Vaerdi, success criteria and test cases marked as a proposal.
- Status: In Progress as soon as you start building or testing. In Review when built, on the test address, checked
  on site and app, and every test case has been run with the result in a comment under the issue. A failed test case
  goes back to In Progress. Approved and merged into `dev`: stays In Review with "i-dev" under its comments. Done only
  when it is live.
- Site and app by default. `kun-web` and `app-senere` are the only exceptions.
- Keep comments short (result, deviations, what is missing). No background agent for small tasks.
- Refer to issues by key (WIN-123) in commits and branches.

## Releases: dev, test database and going live

- **Branches.** `main` is live (winetastr.com, the live database). Work happens on a branch per track
  (`<track>`, e.g. `payment`), merged into `dev` when Morten approves it. `dev` is the next release; it goes live when
  Morten says so, by merging `dev` into `main`. Never push work straight to `main` (only a hotfix Morten asks for).
- **Test addresses.** Cloudflare Pages builds every branch other than `main` on its own preview address
  (`<branch>.tasting-site.pages.dev`). `scripts/db-target.mjs` (prebuild) points those builds at the **test database**
  (Supabase project `winetastr-test`, `piiuhgzsnphhuceojldz`); `main` uses the live one (`ydvdhhdpygzwalosbjcc`).
  A test build shows a "Test" chip by the logo. Locally: `DB=test npm run build`.
- **Database changes.** A migration is applied to the test database first, with the track. It goes to the live
  database only when its release goes live – database first, then the merge to `main`. Every migration must keep the
  live site and every app version working (add, never change; see the app contract), because tracks share the test
  database and a release may go out without some of them. Each release has an issue under WIN-84 in `claude/work/`
  listing its content and migrations.
- **Tests.** `security.sql` (all parts) and `app_contract.sql` run on the test database with every change, and on the
  live database when a release goes live.

## The iOS app (`ios/`)

The site and the native SwiftUI guest app are one product, developed together by one chat. Read `ios/README.md`.

- **Every change is decided for both.** A new feature or general fix that touches guests or the database is planned once and built in the same go in the database, on the site and in the app, unless the issue has the label `kun-web` or `app-senere`. Host and superadmin pages are web only (the app has no admin).
- **Not done until both are checked.** A guest change is not finished before the site and the app (`ios/tools/simbuild.sh`, `ios/tools/simtest.sh`) have been looked at. Building the app needs a session linked to Morten's Mac.
- **The site is the standard for look and words.** The app uses the site's fonts, colours, logo and icons (`ios/Winetastr/Theme.swift` mirrors `global.css` and `components.css`) and its dictionaries (`ios/tools/make_strings.py`). Change a shared colour, component or wording on both. No new icons, logos or styles in the app that the site does not have, unless Morten asks.
- **Database calls are a contract.** Calls the app uses (`supabase/tests/app_contract.sql`) must not change name, arguments, columns or meaning: apps in people's phones cannot be updated with the database. Add optional arguments or new functions; remove old ones only when no app version in use needs them. Run `app_contract.sql` after every database change along with `security.sql`, and add new calls the app starts using.
- **Order:** database first, then site, then app. Nothing may depend on the site and the app being released at the same moment.
- **Business rules live in the database,** so they are not written twice.
- **The repo is public:** no invite codes or secrets in `ios/` (test codes are in the untracked `ios/.env.local`).
- `ios/` is not part of the website build.
