#!/bin/zsh
mkdir -p build
# Run from ios/. Builds the test build (Debug, com.winetastr.app.dev): it talks to the test database and shows "Test".
xcodebuild -project Winetastr.xcodeproj -scheme Winetastr -configuration Debug -destination 'platform=iOS Simulator,id=6FB2F2B7-FE7A-425E-A7E7-B52F31B2AC51' CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= -derivedDataPath build/sim build > build/sim.log 2>&1
grep -E "error:|BUILD (SUCCEEDED|FAILED)" build/sim.log | sort -u | cut -c1-220 | head -20
xcrun simctl install 6FB2F2B7-FE7A-425E-A7E7-B52F31B2AC51 build/sim/Build/Products/Debug-iphonesimulator/Winetastr.app
