# Quick start for agents (read this, then CLAUDE.md)

Everything an agent needs to start work in minutes. CLAUDE.md has the rules; this file has the paths and commands.

## Where things are
- Cloud repo: `/home/claude/tasting-site`. Fixed worktrees: `/home/claude/wt-site` (site work) and `/home/claude/wt-app`
  (app work). Start a task with `git fetch origin && git checkout -B <branch> origin/dev`. `node_modules` is a symlink to
  `/home/claude/tasting-site/node_modules` (`ln -s` it if missing).
- Build the site: `DB=test npm run build`, then `git checkout src/lib/db-target.ts`. `npm run check:ui` alone is fast.
- Requirements: Projects tool, `claude/work/INDEX.md` and the epic file. Don't edit Project files unless asked.

## Databases (Supabase MCP: `execute_sql`, `apply_migration`)
- Test: `piiuhgzsnphhuceojldz`. Live: `ydvdhhdpygzwalosbjcc` – never touch it unless the task says so.
- Any SQL with DELETE or DROP shows a confirmation box that auto-cancels: use `create or replace`, UPDATEs, rollbacks.
  Don't work around the box.
- Security tests: `node scripts/security-parts.mjs` → `supabase/tests/parts/security-1..5.sql` (they contain deletes, see
  above). App contract: `supabase/tests/app_contract.sql`.
- Test tastings: `app-test` (app UI tests), `portvin-2026` (24 guests), `europa-2026`. Fake guests use `@test.invalid`.

## Morten's Mac (iOS)
- Tools: `mcp__remote-devices__Desktop_Commander__start_process` / `read_process_output` (load with ToolSearch
  "select:…"). Not `device_bash` (it only reaches one folder).
- Every call times out after ~60 s: start long jobs with `nohup … &` and poll with `sleep 50; grep …`.
- Worktrees: `/Users/mortensondergaard/Projects/wt-257` (simulator 1) and `/Users/mortensondergaard/Projects/wt-287`
  (simulator 2). Update with `git fetch origin <branch> && git checkout --detach FETCH_HEAD`.
- From `ios/`: `tools/simbuild.sh`, `tools/simtest.sh` (log `ios/build/test.log`, shots `ios/build/shots`). Simulator via
  `SIM=6FB2F2B7-FE7A-425E-A7E7-B52F31B2AC51` (1, default) or `SIM=D145F3CB-09AD-499B-AA8B-DCDFBCD9F6F8` (2).
- While working: `tools/simtest.sh -only-testing:WinetastrUITests/<Class>/<test>`. Full suite once at the end (8–10 min).
- Test codes are in the untracked `ios/.env.local` on the Mac. Never in commits or reports.
- Strings: `ios/tools/make_strings.py` reads GitHub main; `python3 ios/tools/make_strings_local.py <repo root>` reads the
  local `src/i18n` instead.
- Screenshots to look at: copy into `/Users/mortensondergaard/Projects/wt-win-256-check/` and stage with
  `mcp__remote-devices__device_stage_files`.
- Debug switches in the app: `-sendMock failOnce`, `-paymentMock`, env `TASTING_PATCH="key=value,…"`, `REAL_DB=1`.

## Testing
- Danish and English, phone (390) and large screen (1440). Icelandic is not tested.
- Site screenshots with mocked Supabase: Playwright with `page.route` on the Supabase URL (Chromium is preinstalled).
- Real test addresses: `test.winetastr.com` (front page) and `test-app.winetastr.com` (app pages), branch `dev`.

## Commits
- Reference the issue key. End with the Co-Authored-By and Claude-Session lines from the session's attribution notice.
- Push the branch; never merge into `dev`, `review` or `main` yourself.
