#include "internal.h"

int mz80_bcd_v1_format(char *out, size_t capacity, const mz80_bcd *value) {
    char digits[16];
    char text[19];
    int negative;
    int index;
    int length = 0;
    int started = 0;
    if (!out || !value) return MZ80_NUM_INVALID;
    negative = mz80_bcd_unpack(digits, value);
    if (negative < 0) return MZ80_NUM_INVALID;
    if (negative) text[length++] = 45;
    for (index = 15; index >= 4; index--) {
        if (digits[index] || started || index == 4) {
            text[length++] = digits[index] + 48;
            started = 1;
        }
    }
    text[length++] = 46;
    for (index = 3; index >= 0; index--) text[length++] = digits[index] + 48;
    text[length] = 0;
    if (capacity <= length) return MZ80_NUM_BUFFER;
    mz80_bcd_copy(out, text, length + 1);
    return MZ80_NUM_OK;
}
