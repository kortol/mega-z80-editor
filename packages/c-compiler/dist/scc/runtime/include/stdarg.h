#ifndef MZ80_STDARG_H
#define MZ80_STDARG_H

/*
 * TS SCC's internal variadic ABI treats va_list as a pointer to the next
 * two-byte slot. va_start, va_arg, and va_end are compiler built-ins rather
 * than preprocessor macros. This header is intentionally not an external
 * Z80SCC variadic ABI contract.
 */
typedef char *va_list;

#endif
