#include "command.h"
#include <assert.h>
int main(void) {
    wchar_t buffer[100] = {0}; size_t used = 0;
    assert(quote(buffer,100,&used,L"C:\\Games\\my game.exe"));
    assert(wcscmp(buffer,L"\"C:\\Games\\my game.exe\"")==0);
    used=0; assert(quote(buffer,100,&used,L"x\\\"y\\"));
    assert(wcscmp(buffer,L"\"x\\\\\\\"y\\\\\"")==0);
    used=0; assert(!quote(buffer,3,&used,L"long"));
    return 0;
}
