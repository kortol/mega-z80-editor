"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instrTable = void 0;
const alu_1 = require("./alu");
const cb_1 = require("./cb");
const ed_1 = require("./ed");
const ex_1 = require("./ex");
const incdec_1 = require("./incdec");
const io_1 = require("./io");
const jump_1 = require("./jump");
const ld_1 = require("./ld");
const stack_1 = require("./stack");
const misc_1 = require("./misc");
const throwExtendedUnsupported = (op) => [
    {
        match: () => true,
        encode: (_ctx, _args, node) => {
            const args = node.args.join(",");
            throw new Error(`Unsupported extended instruction ${op}${args ? " " + args : ""} (R800/Z280 not implemented)`);
        },
        estimate: 1,
    },
];
exports.instrTable = {
    LD: ld_1.ldInstr,
    // ALU: 即値(式)対応＋（ADDのみ）ADD HL,rr
    ADD: (0, alu_1.makeALUDefs)("ADD", { has16bit: true, allowImplicitA: true }),
    ADC: (0, alu_1.makeALUDefs)("ADC", { has16bit: true, allowImplicitA: true }),
    SUB: (0, alu_1.makeALUDefs)("SUB", { allowImplicitA: true }),
    SBC: (0, alu_1.makeALUDefs)("SBC", { has16bit: true, allowImplicitA: true }),
    AND: (0, alu_1.makeALUDefs)("AND", { allowImplicitA: true }),
    OR: (0, alu_1.makeALUDefs)("OR", { allowImplicitA: true }),
    XOR: (0, alu_1.makeALUDefs)("XOR", { allowImplicitA: true }),
    CP: (0, alu_1.makeALUDefs)("CP", { allowImplicitA: true }),
    INC: incdec_1.incInstr,
    DEC: incdec_1.decInstr,
    EX: ex_1.exInstr,
    IN: io_1.inInstr,
    OUT: io_1.outInstr,
    NOP: misc_1.miscInstr,
    HALT: misc_1.miscInstr,
    DAA: misc_1.miscInstr,
    CPL: misc_1.miscInstr,
    SCF: misc_1.miscInstr,
    CCF: misc_1.miscInstr,
    DI: misc_1.miscInstr,
    EI: misc_1.miscInstr,
    RLCA: misc_1.miscInstr,
    RRCA: misc_1.miscInstr,
    RLA: misc_1.miscInstr,
    RRA: misc_1.miscInstr,
    EXX: misc_1.miscInstr,
    RLC: cb_1.cbRotInstr,
    RRC: cb_1.cbRotInstr,
    RL: cb_1.cbRotInstr,
    RR: cb_1.cbRotInstr,
    SLA: cb_1.cbRotInstr,
    SRA: cb_1.cbRotInstr,
    SLL: cb_1.cbRotInstr,
    SRL: cb_1.cbRotInstr,
    BIT: cb_1.cbBitInstr,
    RES: cb_1.cbBitInstr,
    SET: cb_1.cbBitInstr,
    LDI: ed_1.edNoArgInstr,
    LDIR: ed_1.edNoArgInstr,
    LDD: ed_1.edNoArgInstr,
    LDDR: ed_1.edNoArgInstr,
    CPI: ed_1.edNoArgInstr,
    CPIR: ed_1.edNoArgInstr,
    CPD: ed_1.edNoArgInstr,
    CPDR: ed_1.edNoArgInstr,
    INI: ed_1.edNoArgInstr,
    INIR: ed_1.edNoArgInstr,
    IND: ed_1.edNoArgInstr,
    INDR: ed_1.edNoArgInstr,
    OUTI: ed_1.edNoArgInstr,
    OTIR: ed_1.edNoArgInstr,
    OUTD: ed_1.edNoArgInstr,
    OTDR: ed_1.edNoArgInstr,
    NEG: ed_1.edNoArgInstr,
    RETN: ed_1.edNoArgInstr,
    RETI: ed_1.edNoArgInstr,
    RRD: ed_1.edNoArgInstr,
    RLD: ed_1.edNoArgInstr,
    IM: ed_1.imInstr,
    // 分岐命令
    JP: jump_1.JPInstrDefs,
    JR: jump_1.JRInstrDefs,
    CALL: jump_1.CALLInstrDefs,
    RET: jump_1.RETInstrDefs,
    RST: jump_1.RSTInstrDefs,
    DJNZ: jump_1.DJNZInstrDefs,
    // Stack
    PUSH: stack_1.pushInstr,
    POP: stack_1.popInstr,
    // --- Extended ISA (R800/Z280 etc.) ---
    MULUB: throwExtendedUnsupported("MULUB"),
    MULUW: throwExtendedUnsupported("MULUW"),
    SLP: throwExtendedUnsupported("SLP"),
    MLT: throwExtendedUnsupported("MLT"),
    IN0: throwExtendedUnsupported("IN0"),
    OUT0: throwExtendedUnsupported("OUT0"),
    INO: throwExtendedUnsupported("INO"),
    OUTO: throwExtendedUnsupported("OUTO"),
    OTIM: throwExtendedUnsupported("OTIM"),
    OTIMR: throwExtendedUnsupported("OTIMR"),
    OTDM: throwExtendedUnsupported("OTDM"),
    OTDMR: throwExtendedUnsupported("OTDMR"),
    TSTIO: throwExtendedUnsupported("TSTIO"),
    TST: throwExtendedUnsupported("TST"),
    MULT: throwExtendedUnsupported("MULT"),
    MULTU: throwExtendedUnsupported("MULTU"),
    MULTW: throwExtendedUnsupported("MULTW"),
    DIV: throwExtendedUnsupported("DIV"),
    DIVU: throwExtendedUnsupported("DIVU"),
    JAF: throwExtendedUnsupported("JAF"),
    JAR: throwExtendedUnsupported("JAR"),
    LDUP: throwExtendedUnsupported("LDUP"),
    LOUD: throwExtendedUnsupported("LOUD"),
};
