# Winetastr iOS app

Native SwiftUI app for guests. Same database and access rules as the website; admin is not in the app.

- Open `Winetastr.xcodeproj` in Xcode 26.
- **Two builds, two databases** (as the site: `main` live, every other branch the test database). The database is chosen
  when the app is built, never in the app (`AppDatabase` in `Winetastr/Backend.swift`, set by `DB_TEST` in the app
  target's Debug configuration):
  - **Test build** – Debug, bundle id `com.winetastr.app.dev`: talks to the test database `winetastr-test`
    (`piiuhgzsnphhuceojldz`) and shows a "Test" chip by the logo, like a test build of the site. Run from Xcode,
    `tools/simbuild.sh`, `tools/simtest.sh` and `tools/shots.sh` all use it.
  - **Real build** – Release (Archive), bundle id `com.winetastr.app`, kept for the App Store: talks to the live
    database and shows no chip. A Release build with `DB_TEST` does not compile.
  - Each build also has its own site address (`AppDatabase.web`, WIN-307): the test build `https://test-app.winetastr.com`,
    the real build `https://app.winetastr.com`. Maps, wine images, the calendar link and the email-change link use it;
    no other fixed address. Invitation links on any address (also old `winetastr.com` links) still give the code.
  - Each build keeps its own invite codes and carts on the device, so codes from one database are never sent to the other.
- `tools/simbuild.sh`: build and install the test build on the simulator. `tools/simtest.sh`: UI tests against the test
  database. `tools/shots.sh`: screenshots.
- `tools/make_strings.py`: builds `Localizable.xcstrings` from the website's dictionaries (`src/i18n`) plus the app's own texts. Run it after changing wording.
- `ios/.env.local` (not in git – the repo is public) holds invite codes in the test database: `TEST_DB_CODE` and
  `TEST_DB_NOMAIL_CODE` (the two guests of the "App-test" tasting the UI tests use) and `TEST_DB_GUEST_CODE` (a guest
  of the test tasting `portvin-2026`). Only the databases' public (publishable) keys are in the code.
- With a free Apple account the app stops working after 7 days and must be installed again from the Mac.
