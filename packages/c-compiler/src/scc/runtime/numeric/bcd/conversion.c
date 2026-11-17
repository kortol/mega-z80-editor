#include "internal.h"

int mz80_bcd_v1_to_int(int *out, const mz80_bcd *value) {
    char digits[16];
    int negative;
    int index;
    int result = 0;
    int limit = 7;
    if (!out || !value) return MZ80_NUM_INVALID;
    negative = mz80_bcd_unpack(digits, value);
    if (negative < 0) return MZ80_NUM_INVALID;
    if (negative) limit = 8;
    for (index = 15; index >= 4; index--) {
        if (result > 3276 || (result == 3276 && digits[index] > limit)) return MZ80_NUM_OVERFLOW;
        if (result == 3276 && digits[index] == 8) {
            if (index != 4) return MZ80_NUM_OVERFLOW;
            result = -32768;
        } else result = result * 10 + digits[index];
    }
    if (negative && result != -32768) result = -result;
    *out = result;
    return MZ80_NUM_OK;
}
