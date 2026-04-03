"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instrTable = void 0;
const alu_1 = require("./alu");
const jump_1 = require("./jump");
const ld_1 = require("./ld");
const stack_1 = require("./stack");
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
};
