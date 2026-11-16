#ifndef ORBIT_GAME_COMMAND_H
#define ORBIT_GAME_COMMAND_H
#include <stddef.h>
#include <wchar.h>
static int put(wchar_t *out, size_t cap, size_t *n, wchar_t c) {
    if (*n + 1 >= cap) return 0;
    out[(*n)++] = c; out[*n] = 0; return 1;
}
static int quote(wchar_t *out, size_t cap, size_t *n, const wchar_t *arg) {
    if (!put(out, cap, n, L'"')) return 0;
    size_t slashes = 0;
    for (;; ++arg) {
        if (*arg == L'\\') { ++slashes; continue; }
        size_t count = (*arg == L'"' || !*arg) ? slashes * 2 : slashes;
        while (count--) if (!put(out, cap, n, L'\\')) return 0;
        slashes = 0;
        if (!*arg) break;
        if (*arg == L'"' && !put(out, cap, n, L'\\')) return 0;
        if (!put(out, cap, n, *arg)) return 0;
    }
    return put(out, cap, n, L'"');
}
#endif
