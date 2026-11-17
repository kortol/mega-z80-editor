#include "internal.h"

int mz80_fixed_divide(char *out, const char *left, const char *right, int count) {
    char numerator[8];
    char denominator[8];
    char remainder[8];
    char quotient[8];
    int negative;
    int index;
    int bit;
    int wide = count + (count >> 1);
    int fraction = count >> 1;
    if (!out || !left || !right) return MZ80_NUM_INVALID;
    mz80_fixed_zero(numerator, wide);
    mz80_fixed_zero(denominator, wide);
    mz80_fixed_zero(remainder, wide);
    mz80_fixed_zero(quotient, wide);
    negative = mz80_fixed_magnitude(numerator, left, count);
    negative = negative != mz80_fixed_magnitude(denominator, right, count);
    if (!mz80_fixed_nonzero(denominator, count)) return MZ80_NUM_DIVZERO;
    for (index = count - 1; index >= 0; index--) numerator[index + fraction] = numerator[index];
    mz80_fixed_zero(numerator, fraction);
    for (index = 0; index < (wide << 3); index++) {
        bit = mz80_fixed_shift_left(numerator, wide, 0);
        mz80_fixed_shift_left(remainder, wide, bit);
        mz80_fixed_shift_left(quotient, wide, 0);
        if (mz80_fixed_unsigned_compare(remainder, denominator, wide) >= 0) {
            mz80_fixed_difference(remainder, remainder, denominator, wide);
            quotient[0] = quotient[0] + 1;
        }
    }
    if (mz80_fixed_nonzero(quotient + count, fraction)) return MZ80_NUM_OVERFLOW;
    return mz80_fixed_commit(out, quotient, count, negative);
}
int mz80_q8_v1_div(mz80_q8_8 *out, const mz80_q8_8 *left, const mz80_q8_8 *right) {
    return mz80_fixed_divide((char *)out, (const char *)left, (const char *)right, 2);
}
int mz80_q16_v1_div(mz80_q16_16 *out, const mz80_q16_16 *left, const mz80_q16_16 *right) {
    return mz80_fixed_divide((char *)out, (const char *)left, (const char *)right, 4);
}
