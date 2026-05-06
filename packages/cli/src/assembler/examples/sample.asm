; ---- sample.asm for parser demo ----
MACRO INCN(reg)
  ADD \1, 1 ; (not actual Z80 syntax, just demo of macro call)
ENDM

start:
  LD A, 0x10
  LD HL, 0FFh
  ADD HL, BC
  .org 0x8000
  REPT 3
    NOP
  ENDM
  ; Macro call-like syntax (demo)
  INCN(A)
