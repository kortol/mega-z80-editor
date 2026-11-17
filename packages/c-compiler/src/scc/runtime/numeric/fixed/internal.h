/* Private byte arithmetic. Each temporary is caller/stack owned. */
#include <mz80_fixed.h>
#define FIXED_ASCII_PLUS 43
#define FIXED_ASCII_MINUS 45
#define FIXED_ASCII_POINT 46
#define FIXED_ASCII_ZERO 48
#define FIXED_ASCII_NINE 57
void mz80_fixed_copy(char *out, const char *in, int count);
void mz80_fixed_zero(char *out, int count);
int mz80_fixed_nonzero(const char *value, int count);
void mz80_fixed_negate(char *value, int count);
int mz80_fixed_magnitude(char *out, const char *value, int count);
int mz80_fixed_unsigned_compare(const char *left, const char *right, int count);
int mz80_fixed_commit(char *out, char *magnitude, int count, int negative);
int mz80_fixed_shift_left(char *value, int count, int carry);
void mz80_fixed_shift_right(char *value, int count);
int mz80_fixed_sum(char *out, const char *left, const char *right, int count);
void mz80_fixed_difference(char *out, const char *left, const char *right, int count);
