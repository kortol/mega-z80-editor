#include "internal.h"

int mz80_fixed_format(char *out, int capacity, const char *value, int count) {
    char magnitude[4];
    char digits[5];
    char fraction_value[2];
    char text[24];
    int negative;
    int length = 0;
    int index;
    int position;
    int carry;
    int digit;
    int started = 0;
    int fraction = count >> 1;
    if (!out || !value) return MZ80_NUM_INVALID;
    negative = mz80_fixed_magnitude(magnitude, value, count);
    mz80_fixed_copy(fraction_value, magnitude, fraction);
    mz80_fixed_zero(digits, 5);
    /* Build decimal integer digits using the 8/16 high magnitude bits. */
    for (position = 0; position < (fraction << 3); position++) {
        carry = mz80_fixed_shift_left(magnitude + fraction, fraction, 0);
        for (index = 4; index >= 0; index--) {
            digit = digits[index] + digits[index] + carry;
            carry = digit >= 10;
            if (carry) digit = digit - 10;
            digits[index] = digit;
        }
    }
    if (negative) text[length++] = FIXED_ASCII_MINUS;
    for (index = 0; index < 5; index++) {
        if (digits[index] || started || index == 4) {
            text[length++] = digits[index] + FIXED_ASCII_ZERO;
            started = 1;
        }
    }
    if (mz80_fixed_nonzero(fraction_value, fraction)) {
        text[length++] = FIXED_ASCII_POINT;
        while (mz80_fixed_nonzero(fraction_value, fraction)) {
            carry = 0;
            for (index = 0; index < fraction; index++) {
                digit = (fraction_value[index] << 3) + (fraction_value[index] << 1) + carry;
                fraction_value[index] = digit;
                carry = digit >> 8;
            }
            text[length++] = carry + FIXED_ASCII_ZERO;
        }
    }
    text[length] = 0;
    if (capacity <= length) return MZ80_NUM_BUFFER;
    mz80_fixed_copy(out, text, length + 1);
    return MZ80_NUM_OK;
}
int mz80_q8_v1_format(char *out, size_t capacity, const mz80_q8_8 *value) {
    return mz80_fixed_format(out, capacity, (const char *)value, 2);
}
int mz80_q16_v1_format(char *out, size_t capacity, const mz80_q16_16 *value) {
    return mz80_fixed_format(out, capacity, (const char *)value, 4);
}
