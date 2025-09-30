; P1-C fixture: expressions, EQU/ORG, LD immediates, arithmetic immediates, DB/DW, EXTERN FROM, external+addend
        ORG 0x0100+0x20         ; -> 0x0120

START:  LD A,1+2*3              ; 7
        LD HL,L1+10
        ADD A,100/2             ; 50
        XOR 1+2+4               ; 7
        SUB 300                 ; overflow -> low 8 bits (0x2C) [assembler warns A2001]

L1:     DB 1+2,3*4              ; 3,12
        DW 100+20,200-50        ; 120,150

FOO     EQU 200
BAR     EQU 100
        DW FOO-BAR              ; 100 (same-module absolute)

        EXTERN EXT

        ; --- Make external+addend relocations at a fixed, known address block ---
        ORG 0x2000
        DB EXT+1                ; R(size=1, addend=+1) at 0x2000
        DW EXT-1                ; R(size=2, addend=-1) at 0x2001
