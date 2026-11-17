/* 2*x + y = 6.5, x - y = 1. Output: 2.5, 1.5 (one per line).
 * Select compiler=ts, features=[fixed]. Works with both caller ABIs.
 * Global objects also satisfy the static-frame profile's storage contract. */
#include <mz80_fixed.h>
#include <stdio.h>

mz80_q16_16 coefficient11;
mz80_q16_16 coefficient12;
mz80_q16_16 coefficient21;
mz80_q16_16 coefficient22;
mz80_q16_16 rhs1;
mz80_q16_16 rhs2;
mz80_q16_16 product1;
mz80_q16_16 product2;
mz80_q16_16 determinant;
mz80_q16_16 numerator;
mz80_q16_16 result_x;
mz80_q16_16 result_y;
char text_x[24];
char text_y[24];

int main(void) {
    if (mz80_q16_from_int(&coefficient11, 2)) return 1;
    if (mz80_q16_from_int(&coefficient12, 1)) return 1;
    if (mz80_q16_from_int(&coefficient21, 1)) return 1;
    if (mz80_q16_from_int(&coefficient22, -1)) return 1;
    if (mz80_q16_parse(&rhs1, "6.5")) return 1;
    if (mz80_q16_parse(&rhs2, "1")) return 1;

    if (mz80_q16_mul(&product1, &coefficient11, &coefficient22)) return 1;
    if (mz80_q16_mul(&product2, &coefficient12, &coefficient21)) return 1;
    if (mz80_q16_sub(&determinant, &product1, &product2)) return 1;

    if (mz80_q16_mul(&product1, &rhs1, &coefficient22)) return 1;
    if (mz80_q16_mul(&product2, &coefficient12, &rhs2)) return 1;
    if (mz80_q16_sub(&numerator, &product1, &product2)) return 1;
    if (mz80_q16_div(&result_x, &numerator, &determinant)) return 1;

    if (mz80_q16_mul(&product1, &coefficient11, &rhs2)) return 1;
    if (mz80_q16_mul(&product2, &rhs1, &coefficient21)) return 1;
    if (mz80_q16_sub(&numerator, &product1, &product2)) return 1;
    if (mz80_q16_div(&result_y, &numerator, &determinant)) return 1;

    if (mz80_q16_format(text_x, 24, &result_x)) return 1;
    if (mz80_q16_format(text_y, 24, &result_y)) return 1;
    puts(text_x);
    puts(text_y);
    return 0;
}
