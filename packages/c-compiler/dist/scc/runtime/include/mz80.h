#ifndef MZ80_H
#define MZ80_H
#include <stddef.h>
#ifdef MZ80_RUNTIME_FULL
int mz80_heap_init(void *base, size_t bytes);
int mz80_heap_check(void);
void mz80_heap_set_debug(int enabled);
#endif
int outstr(char *dollar_terminated_text);
int mz80_cpm_outstr(char *dollar_terminated_text);
#if defined(MZ80_PLATFORM_RAW)
int __mz80_raw_putc(int ch);
int __mz80_raw_getc(void);
int __mz80_raw_exit(int status);
#endif
#endif
