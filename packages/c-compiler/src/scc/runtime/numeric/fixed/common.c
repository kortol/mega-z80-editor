#include "internal.h"

void mz80_fixed_copy(char *out, const char *in, int count) {
    int index;
    for (index = 0; index < count; index++) out[index] = in[index];
    return;
}
void mz80_fixed_zero(char *out, int count) {
    int index;
    for (index = 0; index < count; index++) out[index] = 0;
    return;
}
int mz80_fixed_nonzero(const char *value, int count) {
    int index;
    for (index = 0; index < count; index++) if (value[index]) return 1;
    return 0;
}
void mz80_fixed_negate(char *value, int count) {
    int index;
    int carry = 1;
    int digit;
    for (index = 0; index < count; index++) {
        digit = 255 - value[index] + carry;
        value[index] = digit;
        carry = digit >> 8;
    }
    return;
}
int mz80_fixed_magnitude(char *out, const char *value, int count) {
    int negative = value[count - 1] >= 128;
    mz80_fixed_copy(out, value, count);
    if (negative) mz80_fixed_negate(out, count);
    return negative;
}
int mz80_fixed_unsigned_compare(const char *left, const char *right, int count) {
    int index;
    for (index = count - 1; index >= 0; index--) {
        if (left[index] < right[index]) return -1;
        if (left[index] > right[index]) return 1;
    }
    return 0;
}
int mz80_fixed_commit(char *out, char *magnitude, int count, int negative) {
    if (magnitude[count - 1] > 127) {
        if (!negative || magnitude[count - 1] != 128 || mz80_fixed_nonzero(magnitude, count - 1)) return MZ80_NUM_OVERFLOW;
    }
    if (negative) mz80_fixed_negate(magnitude, count);
    mz80_fixed_copy(out, magnitude, count);
    return MZ80_NUM_OK;
}
int mz80_fixed_shift_left(char *value, int count, int incoming) {
    int index;
    int digit;
    int carry = incoming;
    for (index = 0; index < count; index++) {
        digit = value[index] + value[index] + carry;
        value[index] = digit;
        carry = digit >> 8;
    }
    return carry;
}
void mz80_fixed_shift_right(char *value, int count) {
    int index;
    int carry = 0;
    int digit;
    for (index = count - 1; index >= 0; index--) {
        digit = value[index];
        value[index] = (digit >> 1) + carry;
        carry = (digit & 1) << 7;
    }
    return;
}
int mz80_fixed_sum(char *out, const char *left, const char *right, int count) {
    int index;
    int carry = 0;
    int digit;
    for (index = 0; index < count; index++) {
        digit = left[index] + right[index] + carry;
        out[index] = digit;
        carry = digit >> 8;
    }
    return carry;
}
void mz80_fixed_difference(char *out, const char *left, const char *right, int count) {
    int index;
    int borrow = 0;
    int digit;
    for (index = 0; index < count; index++) {
        digit = left[index] - right[index] - borrow;
        out[index] = digit;
        borrow = digit < 0;
    }
    return;
}
