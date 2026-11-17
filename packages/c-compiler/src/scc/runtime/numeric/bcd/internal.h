#include <mz80_bcd.h>
void mz80_bcd_zero(char *out, int count);
void mz80_bcd_copy(char *out, const char *value, int count);
int mz80_bcd_nonzero(const char *value, int count);
int mz80_bcd_unpack(char *out, const mz80_bcd *value);
void mz80_bcd_pack(mz80_bcd *out, const char *value, int negative);
int mz80_bcd_unsigned_compare(const char *left, const char *right, int count);
int mz80_bcd_sum(char *out, const char *left, const char *right, int count);
void mz80_bcd_difference(char *out, const char *left, const char *right, int count);
void mz80_bcd_decimal_shift(char *value, int count, int digit);
