#ifndef ORBIT_STEAM_SESSION_HEX_H
#define ORBIT_STEAM_SESSION_HEX_H
#include <stddef.h>
static int nibble(unsigned char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}
static int decode_hex(const unsigned char *text, size_t length, unsigned char *out, size_t capacity) {
    if (!length || length % 2 || length / 2 > capacity) return 0;
    for (size_t i = 0; i < length; i += 2) {
        int a = nibble(text[i]), b = nibble(text[i + 1]);
        if (a < 0 || b < 0) return 0;
        out[i / 2] = (unsigned char)((a << 4) | b);
    }
    return 1;
}
#endif
