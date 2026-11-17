#ifndef MZ80_BCD_H
#define MZ80_BCD_H
#include <mz80_numeric.h>
#include <stddef.h>
#ifdef MZ80_FEATURE_BCD
struct mz80_bcd { char bytes[9]; };
typedef struct mz80_bcd mz80_bcd;
int mz80_bcd_v1_from_int(mz80_bcd *out, int value);
#define mz80_bcd_from_int mz80_bcd_v1_from_int
int mz80_bcd_v1_to_int(int *out, const mz80_bcd *value);
int mz80_bcd_v1_add(mz80_bcd *out, const mz80_bcd *left, const mz80_bcd *right);
int mz80_bcd_v1_sub(mz80_bcd *out, const mz80_bcd *left, const mz80_bcd *right);
int mz80_bcd_v1_mul(mz80_bcd *out, const mz80_bcd *left, const mz80_bcd *right);
int mz80_bcd_v1_div(mz80_bcd *out, const mz80_bcd *left, const mz80_bcd *right);
int mz80_bcd_v1_compare(int *order, const mz80_bcd *left, const mz80_bcd *right);
int mz80_bcd_v1_parse(mz80_bcd *out, const char *text);
int mz80_bcd_v1_format(char *out, size_t capacity, const mz80_bcd *value);
#define mz80_bcd_to_int mz80_bcd_v1_to_int
#define mz80_bcd_add mz80_bcd_v1_add
#define mz80_bcd_sub mz80_bcd_v1_sub
#define mz80_bcd_mul mz80_bcd_v1_mul
#define mz80_bcd_div mz80_bcd_v1_div
#define mz80_bcd_compare mz80_bcd_v1_compare
#define mz80_bcd_parse mz80_bcd_v1_parse
#define mz80_bcd_format mz80_bcd_v1_format
#endif
#endif
