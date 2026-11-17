#include "internal.h"

/* Decimal thresholds for an f-bit binary fraction terminate within f decimal
 * places. Later digits cannot cross the next threshold; validate but ignore them.
 * No input mutation, unbounded integer accumulator, or host floating point. */
int mz80_fixed_parse(char *out, const char *input, int count) {
    const char *text = input;
    char integer[4];
    char digits[16];
    char result[4];
    int negative = 0;
    int overflow = 0;
    int index;
    int position = 0;
    int digit;
    int carry;
    int bits = count << 2;
    int fraction = count >> 1;
    if (!out || !text) return MZ80_NUM_INVALID;
    mz80_fixed_zero(integer, count);
    mz80_fixed_zero(digits, bits);
    mz80_fixed_zero(result, count);
    if (*text == FIXED_ASCII_MINUS || *text == FIXED_ASCII_PLUS) {
        negative = *text == FIXED_ASCII_MINUS;
        text++;
    }
    if (*text < FIXED_ASCII_ZERO || *text > FIXED_ASCII_NINE) return MZ80_NUM_INVALID;
    while (*text >= FIXED_ASCII_ZERO && *text <= FIXED_ASCII_NINE) {
        carry = *text - FIXED_ASCII_ZERO;
        if (!overflow) {
            for (index = 0; index < count; index++) {
                digit = (integer[index] << 3) + (integer[index] << 1) + carry;
                integer[index] = digit;
                carry = digit >> 8;
            }
            if (carry) overflow = 1;
        }
        text++;
    }
    if (*text == FIXED_ASCII_POINT) {
        text++;
        if (*text < FIXED_ASCII_ZERO || *text > FIXED_ASCII_NINE) return MZ80_NUM_INVALID;
        while (*text >= FIXED_ASCII_ZERO && *text <= FIXED_ASCII_NINE) {
            if (position < bits) {
                digits[position] = *text - FIXED_ASCII_ZERO;
                position++;
            }
            text++;
        }
    }
    if (*text) return MZ80_NUM_INVALID;
    if (overflow || mz80_fixed_nonzero(integer + fraction, fraction)) return MZ80_NUM_OVERFLOW;
    mz80_fixed_copy(result + fraction, integer, fraction);
    for (position = 0; position < bits; position++) {
        carry = 0;
        for (index = bits - 1; index >= 0; index--) {
            digit = digits[index] + digits[index] + carry;
            carry = digit >= 10;
            if (carry) digit = digit - 10;
            digits[index] = digit;
        }
        mz80_fixed_shift_left(result, fraction, carry);
    }
    return mz80_fixed_commit(out, result, count, negative);
}
int mz80_q8_v1_parse(mz80_q8_8 *out, const char *text) {
    return mz80_fixed_parse((char *)out, text, 2);
}
int mz80_q16_v1_parse(mz80_q16_16 *out, const char *text) {
    return mz80_fixed_parse((char *)out, text, 4);
}
