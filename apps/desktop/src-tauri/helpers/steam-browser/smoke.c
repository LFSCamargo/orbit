/* Real Wine integration fixture: verify flags, visible placement and exit forwarding. */
#ifndef UNICODE
#define UNICODE
#endif
#include <windows.h>
#include <wchar.h>
int wmain(void) {
    if (!wcsstr(GetCommandLineW(), L"--single-process") ||
        !wcsstr(GetCommandLineW(), L"--disable-gpu") ||
        !wcsstr(GetCommandLineW(), L"--in-process-gpu") ||
        !wcsstr(GetCommandLineW(), L"--use-gl=disabled") ||
        !wcsstr(GetCommandLineW(), L"literal space")) return 3;
    HWND window = CreateWindowExW(0, L"STATIC", L"Orbit Steam helper test",
        WS_OVERLAPPEDWINDOW | WS_VISIBLE, 805240832, 805240832,
        700, 440, NULL, NULL, GetModuleHandleW(NULL), NULL);
    if (!window) return 4;
    for (int tick = 0; tick < 100; ++tick) {
        MSG message;
        while (PeekMessageW(&message, NULL, 0, 0, PM_REMOVE)) DispatchMessageW(&message);
        RECT frame;
        if (GetWindowRect(window, &frame) && frame.left < 10000 && frame.top < 10000) {
            DestroyWindow(window);
            return 23;
        }
        Sleep(50);
    }
    DestroyWindow(window);
    return 5;
}
