#!/bin/zsh
mkdir -p build
xcodebuild -project Winetastr.xcodeproj -scheme Winetastr -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= -derivedDataPath build/sim build > build/sim.log 2>&1
grep -E "error:|BUILD (SUCCEEDED|FAILED)" build/sim.log | sort -u | cut -c1-220 | head -20
xcrun simctl install 6FB2F2B7-FE7A-425E-A7E7-B52F31B2AC51 build/sim/Build/Products/Debug-iphonesimulator/Winetastr.app
