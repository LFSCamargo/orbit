#include "command.h"
#include <assert.h>
int main(void) {
    assert(wcscmp(argument_tail(L"\"C:\\Program Files\\helper.exe\" --type=renderer \"x y\""), L"--type=renderer \"x y\"") == 0);
    assert(wcscmp(argument_tail(L"C:\\helper.exe\t--flag"), L"--flag") == 0);
    assert(*argument_tail(L"\"C:\\helper.exe\"") == L'\0');
    wchar_t buffer[4] = {0};
    size_t used = 0;
    assert(append(buffer, 4, &used, L"abc"));
    assert(!append(buffer, 4, &used, L"d"));
    assert(used == 3);
    return 0;
}
