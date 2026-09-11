#ifndef MZ80_ASSERT_H
#define MZ80_ASSERT_H

#ifdef MZ80_RUNTIME_FULL
int __mz80_assert(int condition);
#define assert(expression) __mz80_assert(expression)
#endif

#endif
