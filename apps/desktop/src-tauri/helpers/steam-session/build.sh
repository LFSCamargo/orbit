#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
clang -Wall -Wextra -Werror hex.test.c -o /tmp/orbit-session-hex-test
/tmp/orbit-session-hex-test
x86_64-w64-mingw32-gcc main.c -o ../../assets/steam-session-helper.exe \
  -O2 -Wall -Wextra -Werror -static -Wl,--no-insert-timestamp -lcrypt32 -lbcrypt
