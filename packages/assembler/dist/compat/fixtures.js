"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixtures = void 0;
exports.fixtures = [
    {
        name: "basic",
        source: `
ORG 0x8000
LD A, 10
ADD A, B
LABEL1: NOP
DB 1,2,3
DW 0x1234
DS 4
END
`,
    },
    {
        name: "equ",
        source: `
FOO EQU 10
BAR EQU 0x20
ORG 0x1000
LD A, FOO
LD B, BAR
`,
    },
    {
        name: "section_align",
        source: `
SECTION TEXT
ORG 0x100
DB 1
SECTION DATA, ALIGN=0x10
DB 2
ALIGN 0x10
DB 3
`,
    },
    {
        name: "extern_include",
        source: `
EXTERN EXT1, EXT2
INCLUDE "sub.inc"
LD A, EXT1
`,
        virtualFiles: {
            "sub.inc": `
DB 1,2,3
`,
        },
    },
    {
        name: "macro_basic",
        source: `
PRINT3 MACRO
  LD A,3
  LD B,2
  LD C,1
ENDM
PRINT3
`,
    },
    {
        name: "macro_args",
        source: `
FILLZ MACRO COUNT,VAL
  LD B,COUNT
  LD (HL),VAL
ENDM
FILLZ 10,0
`,
    },
    {
        name: "macro_local",
        source: `
OUTER MACRO
  LOCALMACRO INNER
    NOP
  ENDM
  INNER
ENDM
OUTER
`,
    },
    {
        name: "loop_rept",
        source: `
REPT 3
  DB \\#
ENDM
`,
    },
    {
        name: "loop_irp",
        source: `
IRP X, 10, 20, 30
  DB \\X
ENDM
`,
    },
    {
        name: "loop_irpc",
        source: `
IRPC C, "ABC"
  DB \\C
ENDM
`,
    },
    {
        name: "strings",
        source: `
DB "ABC", 0
DB 'Z'
`,
    },
    {
        name: "z80_edge_io",
        source: `
IM 1
EX AF,AF'
IN (C)
IN F,(C)
OUT (C),0
OUT (C),0x00
LD SP,IX
LD SP,IY
`,
    },
    {
        name: "z80_edge_alu_indexed",
        source: `
ADD A,(IX+1)
ADC A,(IY-2)
SUB (IX+0)
SBC (IY+0)
AND (IX+3)
OR (IY+4)
XOR (IX+5)
CP (IY+6)
`,
    },
];
