#!/bin/zsh
mkdir -p build build/shots
# Usage: tools/shots.sh <suffix> <lang> <route...>; "home" = no route. Run from ios/. Uses the test guest from .env.local (test database).
S=6FB2F2B7-FE7A-425E-A7E7-B52F31B2AC51; suf=$1; lang=$2; shift 2; source .env.local; CODE=${CODE:-$TEST_DB_CODE}
for r in "$@"; do
  if [ "$r" = home ]; then a=(); else a=(-route "$r"); fi
  xcrun simctl launch --terminate-running-process $S com.winetastr.app.dev -inviteCode $CODE $a -AppleLanguages "($lang)" -appLanguage $lang >/dev/null
  sleep 5
  xcrun simctl io $S screenshot build/shots/$r-$suf.png >/dev/null 2>&1
done
