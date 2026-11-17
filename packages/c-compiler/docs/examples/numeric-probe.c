/* Select none / fixed / bcd / both. Exercises all numeric API families.
 * Expected output: optional 1.25 / 1.2500 lines, then CORE. */
#include <stdio.h>
#ifdef MZ80_FEATURE_FIXED
#include <mz80_fixed.h>
mz80_q16_16 fixed_value;
mz80_q16_16 fixed_two;
#endif
#ifdef MZ80_FEATURE_BCD
#include <mz80_bcd.h>
mz80_bcd bcd_value;
mz80_bcd bcd_two;
#endif
char text[24];
int order;
int integer;
int main(void) {
#ifdef MZ80_FEATURE_FIXED
    if (mz80_q16_from_int(&fixed_two, 2)) return 1;
    if (mz80_q16_parse(&fixed_value, "1.25")) return 1;
    if (mz80_q16_mul(&fixed_value, &fixed_value, &fixed_two)) return 1;
    if (mz80_q16_div(&fixed_value, &fixed_value, &fixed_two)) return 1;
    if (mz80_q16_add(&fixed_value, &fixed_value, &fixed_two)) return 1;
    if (mz80_q16_sub(&fixed_value, &fixed_value, &fixed_two)) return 1;
    if (mz80_q16_compare(&order, &fixed_value, &fixed_two)) return 1;
    if (order + 1) return 1;
    if (mz80_q16_to_int(&integer, &fixed_value)) return 1;
    if (integer - 1) return 1;
    if (mz80_q16_format(text, 24, &fixed_value)) return 1;
    puts(text);
#endif
#ifdef MZ80_FEATURE_BCD
    if (mz80_bcd_from_int(&bcd_two, 2)) return 1;
    if (mz80_bcd_parse(&bcd_value, "1.25")) return 1;
    if (mz80_bcd_mul(&bcd_value, &bcd_value, &bcd_two)) return 1;
    if (mz80_bcd_div(&bcd_value, &bcd_value, &bcd_two)) return 1;
    if (mz80_bcd_add(&bcd_value, &bcd_value, &bcd_two)) return 1;
    if (mz80_bcd_sub(&bcd_value, &bcd_value, &bcd_two)) return 1;
    if (mz80_bcd_compare(&order, &bcd_value, &bcd_two)) return 1;
    if (order + 1) return 1;
    if (mz80_bcd_to_int(&integer, &bcd_value)) return 1;
    if (integer - 1) return 1;
    if (mz80_bcd_format(text, 24, &bcd_value)) return 1;
    puts(text);
#endif
    puts("CORE");
    return 0;
}
