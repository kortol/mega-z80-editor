#include "internal.h"

int mz80_bcd_v1_mul(mz80_bcd *out, const mz80_bcd *left, const mz80_bcd *right) {
    char first[16];
    char second[16];
    char product[32];
    int sign_first;
    int sign_second;
    int row;
    int column;
    int carry;
    int digit;
    if (!out || !left || !right) return MZ80_NUM_INVALID;
    sign_first = mz80_bcd_unpack(first, left);
    sign_second = mz80_bcd_unpack(second, right);
    if (sign_first < 0 || sign_second < 0) return MZ80_NUM_INVALID;
    mz80_bcd_zero(product, 32);
    for (row = 0; row < 16; row++) {
        carry = 0;
        for (column = 0; column < 16; column++) {
            digit = product[row + column] + first[row] * second[column] + carry;
            carry = 0;
            while (digit >= 10) { digit = digit - 10; carry++; }
            product[row + column] = digit;
        }
        product[row + 16] = carry;
    }
    if (mz80_bcd_nonzero(product + 20, 12)) return MZ80_NUM_OVERFLOW;
    mz80_bcd_pack(out, product + 4, sign_first != sign_second);
    return MZ80_NUM_OK;
}
