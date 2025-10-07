; ============================================================
;  P1-D Fixture: IX/IY, JR/DJNZ (PC-relative), (nn) absolute, IN/OUT, $
;  Purpose : Integration fixture covering addressing extensions
;  Phase   : P1-D
;  Start   : ORG 0x0100
;  Notes   : No error cases are included (assemble-ok fixture)
; ============================================================

        ORG     0x0100

; ----- External symbol (for 16-bit reloc test) -----
        EXTERN  EXT16

; ----- Constants / Equates -----
PORT_BASE   EQU     0x20
ZERO        EQU     0

; ----- Entry -----
START:
        ; JR forward, DJNZ backward
        JR      NEXT            ; PC-relative forward
        LD      B, 3
DJLOOP: DJNZ    DJLOOP          ; PC-relative backward

NEXT:
        ; Self-skip using $ (current address)
        JR      $+2             ; skip next NOP
        NOP

        ; ----- IX/IY indexed addressing (positive / negative / zero disp) -----
        LD      A,(IX+5)
        LD      (IY-3),B
        ADD     A,(IX+1)
        LD      (IX+0),A        ; zero displacement explicitly allowed

        ; ----- Absolute indirect (nn) -----
        LD      HL,(TABLE)      ; 16-bit absolute load
        LD      (TABLE),A       ; 16-bit absolute store
        LD      DE,(EXT16)      ; external symbol -> 16-bit reloc expected

        ; ----- I/O port immediate (8-bit unsigned) -----
        IN      A,(PORT_BASE)       ; 0x20
        OUT     (PORT_BASE+0x10),A  ; 0x30

        ; ----- Current address in expression -----
        LD      DE,$+10

        ; ----- Data region -----
TABLE:  DB      0x00,0x00,0xAA,0x55

        END     START
