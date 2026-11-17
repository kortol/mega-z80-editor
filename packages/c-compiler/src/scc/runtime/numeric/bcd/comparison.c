#include "internal.h"

int mz80_bcd_v1_compare(int *out, const mz80_bcd *left, const mz80_bcd *right) {
    char first[16];
    char second[16];
    int sign_first;
    int sign_second;
    int order;
    if (!out || !left || !right) return MZ80_NUM_INVALID;
    sign_first = mz80_bcd_unpack(first, left);
    sign_second = mz80_bcd_unpack(second, right);
    if (sign_first < 0 || sign_second < 0) return MZ80_NUM_INVALID;
    if (sign_first != sign_second) {
        order = 1;
        if (sign_first) order = -1;
    } else {
        order = mz80_bcd_unsigned_compare(first, second, 16);
        if (sign_first) order = -order;
    }
    *out = order;
    return MZ80_NUM_OK;
}
