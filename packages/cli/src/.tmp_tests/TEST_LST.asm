
    ORG 0100H
START: LD A,0FFH
       DJNZ START
       JP EXT_C
       END
  