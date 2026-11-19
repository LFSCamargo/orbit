#ifndef ORBIT_STEAM_BROWSER_COMMAND_H
#define ORBIT_STEAM_BROWSER_COMMAND_H
#include <stddef.h>
#include <wchar.h>

/* The first token is an executable path, which cannot contain a literal quote. */
static const wchar_t *argument_tail(const wchar_t *command) {
    int quoted = 0;
    while (*command) {
        if (*command == L'"') quoted = !quoted;
        if (!quoted && (*command == L' ' || *command == L'\t')) break;
        ++command;
    }
    while (*command == L' ' || *command == L'\t') ++command;
    return command;
}

/* Windows command lines include their terminating null in the 32767 limit. */
static int append(wchar_t *buffer, size_t capacity, size_t *used, const wchar_t *text) {
    while (*text) {
        if (*used + 1 >= capacity) return 0;
        buffer[(*used)++] = *text++;
    }
    buffer[*used] = L'\0';
    return 1;
}
#endif
