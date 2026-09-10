#ifndef MZ80_H
#define MZ80_H
int outstr(char *dollar_terminated_text);
int mz80_cpm_outstr(char *dollar_terminated_text);
#if defined(MZ80_PLATFORM_RAW)
int __mz80_raw_putc(int ch);
int __mz80_raw_getc(void);
int __mz80_raw_exit(int status);
#endif
#endif
