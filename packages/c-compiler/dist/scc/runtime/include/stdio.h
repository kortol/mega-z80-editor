#ifndef MZ80_STDIO_H
#define MZ80_STDIO_H
int getchar(void);
int putchar(int ch);
int puts(char *text);
#ifdef MZ80_RUNTIME_FULL
int printf(char *format, ...);
int sprintf(char *buffer, char *format, ...);
#endif
#endif
