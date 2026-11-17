#include "internal.h"

int mz80_fixed_to_int(int *out, const char *value, int count) {
    char magnitude[4];
    char integer[2];
    int negative;
    if (!out || !value) return MZ80_NUM_INVALID;
    negative = mz80_fixed_magnitude(magnitude, value, count);
    integer[0] = magnitude[count >> 1];
    integer[1] = 0;
    if (count == 4) integer[1] = magnitude[3];
    if (negative) mz80_fixed_negate(integer, 2);
    mz80_fixed_copy((char *)out, integer, 2);
    return MZ80_NUM_OK;
}
int mz80_q8_v1_to_int(int *out, const mz80_q8_8 *value) {
    return mz80_fixed_to_int(out, (const char *)value, 2);
}
int mz80_q16_v1_to_int(int *out, const mz80_q16_16 *value) {
    return mz80_fixed_to_int(out, (const char *)value, 4);
}
