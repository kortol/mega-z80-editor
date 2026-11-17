#include "internal.h"

int mz80_bcd_v1_div(mz80_bcd *out, const mz80_bcd *left, const mz80_bcd *right) {
    char numerator[20];
    char denominator[20];
    char remainder[20];
    char quotient[20];
    int sign_first;
    int sign_second;
    int index;
    int digit;
    if (!out || !left || !right) return MZ80_NUM_INVALID;
    mz80_bcd_zero(numerator, 20);
    mz80_bcd_zero(denominator, 20);
    mz80_bcd_zero(remainder, 20);
    mz80_bcd_zero(quotient, 20);
    sign_first = mz80_bcd_unpack(numerator + 4, left);
    sign_second = mz80_bcd_unpack(denominator, right);
    if (sign_first < 0 || sign_second < 0) return MZ80_NUM_INVALID;
    if (!mz80_bcd_nonzero(denominator, 16)) return MZ80_NUM_DIVZERO;
    for (index = 19; index >= 0; index--) {
        mz80_bcd_decimal_shift(remainder, 20, numerator[index]);
        digit = 0;
        while (mz80_bcd_unsigned_compare(remainder, denominator, 20) >= 0) {
            mz80_bcd_difference(remainder, remainder, denominator, 20);
            digit++;
        }
        quotient[index] = digit;
    }
    if (mz80_bcd_nonzero(quotient + 16, 4)) return MZ80_NUM_OVERFLOW;
    mz80_bcd_pack(out, quotient, sign_first != sign_second);
    return MZ80_NUM_OK;
}
