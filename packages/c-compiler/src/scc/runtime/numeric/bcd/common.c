#include "internal.h"

void mz80_bcd_zero(char *out, int count) {
    int index;
    for (index = 0; index < count; index++) out[index] = 0;
    return;
}
void mz80_bcd_copy(char *out, const char *value, int count) {
    int index;
    for (index = 0; index < count; index++) out[index] = value[index];
    return;
}
int mz80_bcd_nonzero(const char *value, int count) {
    int index;
    for (index = 0; index < count; index++) if (value[index]) return 1;
    return 0;
}
int mz80_bcd_unpack(char *out, const mz80_bcd *value) {
    int index;
    int high;
    int low;
    if (value->bytes[0] > 1) return -1;
    for (index = 0; index < 8; index++) {
        high = value->bytes[index + 1] >> 4;
        low = value->bytes[index + 1] & 15;
        if (high > 9 || low > 9) return -1;
        out[15 - (index << 1)] = high;
        out[14 - (index << 1)] = low;
    }
    if (!mz80_bcd_nonzero(out, 16)) return 0;
    return value->bytes[0];
}
void mz80_bcd_pack(mz80_bcd *out, const char *value, int negative) {
    int index;
    out->bytes[0] = 0;
    if (mz80_bcd_nonzero(value, 16)) out->bytes[0] = negative;
    for (index = 0; index < 8; index++) {
        out->bytes[index + 1] = (value[15 - (index << 1)] << 4) + value[14 - (index << 1)];
    }
    return;
}
int mz80_bcd_unsigned_compare(const char *left, const char *right, int count) {
    int index;
    for (index = count - 1; index >= 0; index--) {
        if (left[index] < right[index]) return -1;
        if (left[index] > right[index]) return 1;
    }
    return 0;
}
int mz80_bcd_sum(char *out, const char *left, const char *right, int count) {
    int index;
    int carry = 0;
    int digit;
    for (index = 0; index < count; index++) {
        digit = left[index] + right[index] + carry;
        carry = digit >= 10;
        if (carry) digit = digit - 10;
        out[index] = digit;
    }
    return carry;
}
void mz80_bcd_difference(char *out, const char *left, const char *right, int count) {
    int index;
    int borrow = 0;
    int digit;
    for (index = 0; index < count; index++) {
        digit = left[index] - right[index] - borrow;
        borrow = digit < 0;
        if (borrow) digit = digit + 10;
        out[index] = digit;
    }
    return;
}
void mz80_bcd_decimal_shift(char *value, int count, int digit) {
    int index;
    for (index = count - 1; index > 0; index--) value[index] = value[index - 1];
    value[0] = digit;
    return;
}
