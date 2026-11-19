#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
clang -Wall -Wextra -Werror command.test.c -o /tmp/orbit-steam-command-test
/tmp/orbit-steam-command-test
x86_64-w64-mingw32-gcc main.c -o ../../assets/steam-browser-helper.exe \
  -municode -O2 -Wall -Wextra -Werror -static -mwindows \
  -Wl,--no-insert-timestamp -luser32
