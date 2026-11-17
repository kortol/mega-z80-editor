#include "internal.h"

int mz80_fixed_compare(int *out, const char *left, const char *right, int count) {
    int sign_first;
    int sign_second;
    int order;
    if (!out || !left || !right) return MZ80_NUM_INVALID;
    sign_first = left[count - 1] >= 128;
    sign_second = right[count - 1] >= 128;
    if (sign_first != sign_second) {
        order = 1;
        if (sign_first) order = -1;
    } else order = mz80_fixed_unsigned_compare(left, right, count);
    *out = order;
    return MZ80_NUM_OK;
}
int mz80_q8_v1_compare(int *out, const mz80_q8_8 *left, const mz80_q8_8 *right) {
    return mz80_fixed_compare(out, (const char *)left, (const char *)right, 2);
}
int mz80_q16_v1_compare(int *out, const mz80_q16_16 *left, const mz80_q16_16 *right) {
    return mz80_fixed_compare(out, (const char *)left, (const char *)right, 4);
}
