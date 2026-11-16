#ifndef MZ80_STDLIB_H
#define MZ80_STDLIB_H
#include <stddef.h>

#ifdef MZ80_RUNTIME_FULL
#define EXIT_SUCCESS 0
#define EXIT_FAILURE 1
int abs(int value);
int atoi(char *text);
void exit(int status);
int rand(void);
void srand(int seed);
void *malloc(size_t bytes);
void free(void *pointer);
void *calloc(size_t count, size_t bytes);
void *realloc(void *pointer, size_t bytes);
#endif

#endif
