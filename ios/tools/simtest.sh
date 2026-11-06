#!/bin/zsh
mkdir -p build
# Run from ios/. UI tests run the test build (Debug), so they talk to the test database (winetastr-test), never live.
# Needs ios/.env.local with TEST_DB_CODE and TEST_DB_NOMAIL_CODE: invite codes of the "App-test" tasting in the test database.
source .env.local
if [ -z "$TEST_DB_CODE" ] || [ -z "$TEST_DB_NOMAIL_CODE" ]; then echo "ios/.env.local needs TEST_DB_CODE and TEST_DB_NOMAIL_CODE (see ios/README.md)"; exit 1; fi
export TEST_RUNNER_APP_TEST_CODE=$TEST_DB_CODE TEST_RUNNER_APP_TEST_NOMAIL_CODE=$TEST_DB_NOMAIL_CODE
# Tests that take a screenshot for a look put it here
mkdir -p build/shots; export TEST_RUNNER_SHOT_DIR=$PWD/build/shots
xcodebuild test -project Winetastr.xcodeproj -scheme Winetastr -configuration Debug -destination 'platform=iOS Simulator,id=6FB2F2B7-FE7A-425E-A7E7-B52F31B2AC51' CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= -derivedDataPath build/sim -parallel-testing-enabled NO "$@" > build/test.log 2>&1
