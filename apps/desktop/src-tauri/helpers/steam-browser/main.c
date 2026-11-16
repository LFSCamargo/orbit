/* Orbit's Steam CEF launcher. The original Valve executable remains unchanged.
 * Build with build.sh. No credentials, command lines, or browser data are logged.
 */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include "command.h"

#define CAPACITY 32767
static wchar_t original[CAPACITY];
static wchar_t command[CAPACITY];

typedef struct {
    DWORD pid;
    unsigned int visited;
} WindowOwner;

/* Recover only this helper's visible, offscreen windows. Do not move other apps. */
static BOOL CALLBACK recover_window(HWND window, LPARAM parameter) {
    WindowOwner *owner = (WindowOwner *)parameter;
    if (++owner->visited > 256) return FALSE;
    DWORD pid = 0;
    GetWindowThreadProcessId(window, &pid);
    if (pid != owner->pid || !IsWindowVisible(window)) return TRUE;
    RECT frame, intersection;
    if (!GetWindowRect(window, &frame)) return TRUE;
    MONITORINFO monitor = {0};
    monitor.cbSize = sizeof(monitor);
    if (!GetMonitorInfoW(MonitorFromWindow(window, MONITOR_DEFAULTTOPRIMARY), &monitor)) return TRUE;
    if (IntersectRect(&intersection, &frame, &monitor.rcWork)) return TRUE;
    SetWindowPos(window, NULL, monitor.rcWork.left + 40, monitor.rcWork.top + 40,
                 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    return TRUE;
}

int wmain(void) {
    DWORD length = GetModuleFileNameW(NULL, original, CAPACITY);
    if (!length || length >= CAPACITY) return 1;
    size_t used = length;
    while (used && original[used - 1] != L'\\') --used;
    if (!used) return 1;
    original[used] = L'\0';
    if (!append(original, CAPACITY, &used, L"steamwebhelper-orbit-original.exe")) return 1;
    used = 0;
    if (!append(command, CAPACITY, &used, L"\"") ||
        !append(command, CAPACITY, &used, original) ||
        !append(command, CAPACITY, &used, L"\" --disable-gpu --single-process ") ||
        !append(command, CAPACITY, &used, argument_tail(GetCommandLineW()))) return 1;
    STARTUPINFOW startup = {0};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION child = {0};
    if (!CreateProcessW(original, command, NULL, NULL, TRUE, 0, NULL, NULL, &startup, &child)) return 1;
    CloseHandle(child.hThread);
    /* Bound recovery to startup. Normal movement is owned by Orbit's modal host. */
    for (unsigned int tick = 0; tick < 480; ++tick) {
        DWORD result = WaitForSingleObject(child.hProcess, 250);
        if (result == WAIT_OBJECT_0) break;
        if (result == WAIT_FAILED) { CloseHandle(child.hProcess); return 1; }
        WindowOwner owner = {child.dwProcessId, 0};
        EnumWindows(recover_window, (LPARAM)&owner);
    }
    if (WaitForSingleObject(child.hProcess, INFINITE) != WAIT_OBJECT_0) {
        CloseHandle(child.hProcess);
        return 1;
    }
    DWORD code = 1;
    GetExitCodeProcess(child.hProcess, &code);
    CloseHandle(child.hProcess);
    return (int)code;
}
