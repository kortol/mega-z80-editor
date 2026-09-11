#ifndef MZ80_STRING_H
#define MZ80_STRING_H
int memcmp(char *left, char *right, int count);
char *memcpy(char *destination, char *source, int count);
char *memmove(char *destination, char *source, int count);
char *memset(char *destination, int value, int count);
int strcmp(char *left, char *right);
int strcoll(char *left, char *right);
int strxfrm(char *destination, char *source, int count);
char *strcat(char *destination, char *source);
char *strncat(char *destination, char *source, int count);
char *strcpy(char *destination, char *source);
char *strchr(char *text, int ch);
int strncmp(char *left, char *right, int count);
char *strncpy(char *destination, char *source, int count);
char *strrchr(char *text, int ch);
char *strpbrk(char *text, char *accept);
int strspn(char *text, char *accept);
int strcspn(char *text, char *reject);
char *strstr(char *haystack, char *needle);
char *strtok(char *text, char *delimiters);
int strlen(char *text);
#endif
