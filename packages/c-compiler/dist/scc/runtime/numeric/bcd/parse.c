#include "internal.h"

int mz80_bcd_v1_parse(mz80_bcd *out, const char *input) {
    const char *text = input;
    char digits[16];
    int negative = 0;
    int overflow = 0;
    int precision = 0;
    int fraction = 0;
    int index;
    if (!out || !text) return MZ80_NUM_INVALID;
    mz80_bcd_zero(digits, 16);
    if (*text == 43 || *text == 45) { negative = *text == 45; text++; }
    if (*text < 48 || *text > 57) return MZ80_NUM_INVALID;
    while (*text >= 48 && *text <= 57) {
        if (!overflow) {
            mz80_bcd_decimal_shift(digits, 16, *text - 48);
            if (mz80_bcd_nonzero(digits + 12, 4)) overflow = 1;
        }
        text++;
    }
    for (index = 11; index >= 0; index--) digits[index + 4] = digits[index];
    mz80_bcd_zero(digits, 4);
    if (*text == 46) {
        text++;
        if (*text < 48 || *text > 57) return MZ80_NUM_INVALID;
        while (*text >= 48 && *text <= 57) {
            if (fraction < 4) { digits[3 - fraction] = *text - 48; fraction++; }
            else precision = 1;
            text++;
        }
    }
    if (*text) return MZ80_NUM_INVALID;
    if (precision) return MZ80_NUM_PRECISION;
    if (overflow) return MZ80_NUM_OVERFLOW;
    mz80_bcd_pack(out, digits, negative);
    return MZ80_NUM_OK;
}
