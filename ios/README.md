# Winetastr iOS app

Native SwiftUI app for guests. Same database and access rules as the website; admin is not in the app.

- Open `Winetastr.xcodeproj` in Xcode 26. Bundle id for testing: `com.winetastr.app.dev` (`com.winetastr.app` is kept for the App Store).
- `tools/simbuild.sh`: build and install on the simulator. `tools/simtest.sh`: UI tests against the real database. `tools/shots.sh`: screenshots.
- `tools/make_strings.py`: builds `Localizable.xcstrings` from the website's dictionaries (`src/i18n`) plus the app's own texts. Run it after changing wording.
- `ios/.env.local` (not in git) holds invite codes for a test tasting.
- With a free Apple account the app stops working after 7 days and must be installed again from the Mac.
