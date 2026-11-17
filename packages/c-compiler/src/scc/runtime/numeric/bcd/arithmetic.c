#include "internal.h"

int mz80_bcd_addsub(mz80_bcd *out, const mz80_bcd *left, const mz80_bcd *right, int subtract) {
    char first[16];
    char second[16];
    char result[16];
    int sign_first;
    int sign_second;
    if (!out || !left || !right) return MZ80_NUM_INVALID;
    sign_first = mz80_bcd_unpack(first, left);
    sign_second = mz80_bcd_unpack(second, right);
    if (sign_first < 0 || sign_second < 0) return MZ80_NUM_INVALID;
    if (subtract) sign_second = !sign_second;
    if (sign_first == sign_second) {
        if (mz80_bcd_sum(result, first, second, 16)) return MZ80_NUM_OVERFLOW;
    } else {
        if (mz80_bcd_unsigned_compare(first, second, 16) < 0) {
            mz80_bcd_difference(result, second, first, 16);
            sign_first = sign_second;
        } else mz80_bcd_difference(result, first, second, 16);
    }
    mz80_bcd_pack(out, result, sign_first);
    return MZ80_NUM_OK;
}
int mz80_bcd_v1_add(mz80_bcd *out, const mz80_bcd *left, const mz80_bcd *right) {
    return mz80_bcd_addsub(out, left, right, 0);
}
int mz80_bcd_v1_sub(mz80_bcd *out, const mz80_bcd *left, const mz80_bcd *right) {
    return mz80_bcd_addsub(out, left, right, 1);
}
