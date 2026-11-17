#include "internal.h"

int mz80_fixed_addsub(char *out, const char *left, const char *right, int count, int subtract) {
    char first[4];
    char second[4];
    char result[4];
    int sign_first;
    int sign_second;
    int order;
    if (!out || !left || !right) return MZ80_NUM_INVALID;
    sign_first = mz80_fixed_magnitude(first, left, count);
    sign_second = mz80_fixed_magnitude(second, right, count);
    if (subtract) sign_second = !sign_second;
    if (sign_first == sign_second) {
        if (mz80_fixed_sum(result, first, second, count)) return MZ80_NUM_OVERFLOW;
    } else {
        order = mz80_fixed_unsigned_compare(first, second, count);
        if (order < 0) {
            mz80_fixed_difference(result, second, first, count);
            sign_first = sign_second;
        } else mz80_fixed_difference(result, first, second, count);
    }
    return mz80_fixed_commit(out, result, count, sign_first);
}
int mz80_q8_v1_add(mz80_q8_8 *out, const mz80_q8_8 *left, const mz80_q8_8 *right) {
    return mz80_fixed_addsub((char *)out, (const char *)left, (const char *)right, 2, 0);
}
int mz80_q16_v1_add(mz80_q16_16 *out, const mz80_q16_16 *left, const mz80_q16_16 *right) {
    return mz80_fixed_addsub((char *)out, (const char *)left, (const char *)right, 4, 0);
}
int mz80_q8_v1_sub(mz80_q8_8 *out, const mz80_q8_8 *left, const mz80_q8_8 *right) {
    return mz80_fixed_addsub((char *)out, (const char *)left, (const char *)right, 2, 1);
}
int mz80_q16_v1_sub(mz80_q16_16 *out, const mz80_q16_16 *left, const mz80_q16_16 *right) {
    return mz80_fixed_addsub((char *)out, (const char *)left, (const char *)right, 4, 1);
}
