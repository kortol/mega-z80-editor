ORG 0x8000
START:  LD A, 0x12
        LD B, 'Z'
        LD C, 3
        DB "HELLO", 0
        DW 0x1234
        ALIGN 0x10
        DB 1,2,3
END
