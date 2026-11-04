#!/bin/zsh
mkdir -p build
# Run from ios/. Needs ios/.env.local with APP_TEST_CODE and APP_TEST_NOMAIL_CODE (invite codes of a test tasting).
source .env.local
export TEST_RUNNER_APP_TEST_CODE=$APP_TEST_CODE TEST_RUNNER_APP_TEST_NOMAIL_CODE=$APP_TEST_NOMAIL_CODE
# Tests that take a screenshot for a look put it here
mkdir -p build/shots; export TEST_RUNNER_SHOT_DIR=$PWD/build/shots
xcodebuild test -project Winetastr.xcodeproj -scheme Winetastr -destination 'platform=iOS Simulator,id=6FB2F2B7-FE7A-425E-A7E7-B52F31B2AC51' CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= -derivedDataPath build/sim -parallel-testing-enabled NO "$@" > build/test.log 2>&1
