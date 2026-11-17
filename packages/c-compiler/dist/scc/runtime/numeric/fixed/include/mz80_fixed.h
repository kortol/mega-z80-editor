#ifndef MZ80_FIXED_H
#define MZ80_FIXED_H
#include <mz80_numeric.h>
#include <stddef.h>
#ifdef MZ80_FEATURE_FIXED
struct mz80_q8_8 { char bytes[2]; };
typedef struct mz80_q8_8 mz80_q8_8;
struct mz80_q16_16 { char bytes[4]; };
typedef struct mz80_q16_16 mz80_q16_16;
int mz80_q8_v1_from_int(mz80_q8_8 *out, int value);
int mz80_q16_v1_from_int(mz80_q16_16 *out, int value);
#define mz80_q8_from_int mz80_q8_v1_from_int
#define mz80_q16_from_int mz80_q16_v1_from_int
int mz80_q8_v1_to_int(int *out, const mz80_q8_8 *value);
int mz80_q16_v1_to_int(int *out, const mz80_q16_16 *value);
int mz80_q8_v1_add(mz80_q8_8 *out, const mz80_q8_8 *left, const mz80_q8_8 *right);
int mz80_q16_v1_add(mz80_q16_16 *out, const mz80_q16_16 *left, const mz80_q16_16 *right);
int mz80_q8_v1_sub(mz80_q8_8 *out, const mz80_q8_8 *left, const mz80_q8_8 *right);
int mz80_q16_v1_sub(mz80_q16_16 *out, const mz80_q16_16 *left, const mz80_q16_16 *right);
int mz80_q8_v1_mul(mz80_q8_8 *out, const mz80_q8_8 *left, const mz80_q8_8 *right);
int mz80_q16_v1_mul(mz80_q16_16 *out, const mz80_q16_16 *left, const mz80_q16_16 *right);
int mz80_q8_v1_div(mz80_q8_8 *out, const mz80_q8_8 *left, const mz80_q8_8 *right);
int mz80_q16_v1_div(mz80_q16_16 *out, const mz80_q16_16 *left, const mz80_q16_16 *right);
int mz80_q8_v1_compare(int *order, const mz80_q8_8 *left, const mz80_q8_8 *right);
int mz80_q16_v1_compare(int *order, const mz80_q16_16 *left, const mz80_q16_16 *right);
int mz80_q8_v1_parse(mz80_q8_8 *out, const char *text);
int mz80_q16_v1_parse(mz80_q16_16 *out, const char *text);
int mz80_q8_v1_format(char *out, size_t capacity, const mz80_q8_8 *value);
int mz80_q16_v1_format(char *out, size_t capacity, const mz80_q16_16 *value);
#define mz80_q8_to_int mz80_q8_v1_to_int
#define mz80_q16_to_int mz80_q16_v1_to_int
#define mz80_q8_add mz80_q8_v1_add
#define mz80_q16_add mz80_q16_v1_add
#define mz80_q8_sub mz80_q8_v1_sub
#define mz80_q16_sub mz80_q16_v1_sub
#define mz80_q8_mul mz80_q8_v1_mul
#define mz80_q16_mul mz80_q16_v1_mul
#define mz80_q8_div mz80_q8_v1_div
#define mz80_q16_div mz80_q16_v1_div
#define mz80_q8_compare mz80_q8_v1_compare
#define mz80_q16_compare mz80_q16_v1_compare
#define mz80_q8_parse mz80_q8_v1_parse
#define mz80_q16_parse mz80_q16_v1_parse
#define mz80_q8_format mz80_q8_v1_format
#define mz80_q16_format mz80_q16_v1_format
#endif
#endif
