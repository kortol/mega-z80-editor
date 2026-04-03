ORG 0x8000
START:  LD A, 0x12
        MULUB A,B
        MLT BC
        SLP
        JAF START
        LDUP HL,(1234H)
        IN0 A,(0)
        OTIM (HL)
        TSTIO 0
END