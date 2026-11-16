#include "hex.h"
#include <assert.h>
int main(void) {
    unsigned char out[2];
    assert(decode_hex((const unsigned char *)"00aF", 4, out, 2));
    assert(out[0] == 0 && out[1] == 175);
    assert(!decode_hex((const unsigned char *)"0x", 2, out, 2));
    assert(!decode_hex((const unsigned char *)"a", 1, out, 2));
    assert(!decode_hex((const unsigned char *)"000000", 6, out, 2));
    return 0;
}
