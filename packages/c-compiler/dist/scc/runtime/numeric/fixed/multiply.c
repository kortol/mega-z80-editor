#include "internal.h"

int mz80_fixed_multiply(char *out, const char *left, const char *right, int count) {
    char first[8];
    char second[4];
    char product[8];
    int negative;
    int index;
    int wide = count + count;
    int fraction = count >> 1;
    if (!out || !left || !right) return MZ80_NUM_INVALID;
    mz80_fixed_zero(first, wide);
    mz80_fixed_zero(product, wide);
    negative = mz80_fixed_magnitude(first, left, count);
    negative = negative != mz80_fixed_magnitude(second, right, count);
    for (index = 0; index < (count << 3); index++) {
        if (second[0] & 1) mz80_fixed_sum(product, product, first, wide);
        mz80_fixed_shift_left(first, wide, 0);
        mz80_fixed_shift_right(second, count);
    }
    if (mz80_fixed_nonzero(product + count + fraction, count - fraction)) return MZ80_NUM_OVERFLOW;
    return mz80_fixed_commit(out, product + fraction, count, negative);
}
int mz80_q8_v1_mul(mz80_q8_8 *out, const mz80_q8_8 *left, const mz80_q8_8 *right) {
    return mz80_fixed_multiply((char *)out, (const char *)left, (const char *)right, 2);
}
int mz80_q16_v1_mul(mz80_q16_16 *out, const mz80_q16_16 *left, const mz80_q16_16 *right) {
    return mz80_fixed_multiply((char *)out, (const char *)left, (const char *)right, 4);
}
