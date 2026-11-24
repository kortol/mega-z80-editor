#include <stdio.h>
#include <stdlib.h>
#ifdef MZ80_FEATURE_FIXED
#include <mz80_fixed.h>
mz80_q16_16 fixed_value;
#endif
#ifdef MZ80_FEATURE_BCD
#include <mz80_bcd.h>
mz80_bcd bcd_value;
#endif
int initial = 65;
int blank;
int *initial_pointer = &initial;
char label[2] = {66,0};
char numeric_text[24];

/* Configure startup.entry=program_entry and startup.initHeap=true. */
int program_entry(void) {
    char *block;
    putchar(initial);
    puts(label);
    putchar(blank + 67);
    *initial_pointer = 68;
    putchar(initial);
    block = malloc(8);
    block[0] = 69;
    putchar(block[0]);
    free(block);
    puts(" READY");
#ifdef MZ80_FEATURE_FIXED
    if (mz80_q16_parse(&fixed_value,"1.25")) return 1;
    if (mz80_q16_format(numeric_text,24,&fixed_value)) return 1;
    puts(numeric_text);
#endif
#ifdef MZ80_FEATURE_BCD
    if (mz80_bcd_parse(&bcd_value,"1.25")) return 1;
    if (mz80_bcd_format(numeric_text,24,&bcd_value)) return 1;
    puts(numeric_text);
#endif
    return 0;
}
