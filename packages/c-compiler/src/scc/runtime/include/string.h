#ifndef MZ80_STRING_H
#define MZ80_STRING_H
int memcmp(char *left, char *right, int count);
char *memcpy(char *destination, char *source, int count);
char *memset(char *destination, int value, int count);
int strcmp(char *left, char *right);
char *strcpy(char *destination, char *source);
int strlen(char *text);
#endif
