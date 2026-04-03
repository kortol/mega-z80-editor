"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateInstrSize = estimateInstrSize;
exports.encodeInstr = encodeInstr;
exports.getZ80OpcodeTable = getZ80OpcodeTable;
exports.encodeLegacyInstr = encodeLegacyInstr;
const ld_1 = require("./encoder/ld");
const alu_1 = require("./encoder/alu");
const incdec_1 = require("./encoder/incdec");
// import { encodeJP, encodeJR, encodeCALL, encodeRET, encodeRST, encodeDJNZ, } from "./encoder/jump";
const ex_1 = require("./encoder/ex");
const misc_1 = require("./encoder/misc");
const cb_1 = require("./encoder/cb");
const io_1 = require("./encoder/io");
const ed_1 = require("./encoder/ed");
const stack_1 = require("./encoder/stack");
const instrTable_1 = require("./encoder/instrTable");
const classifyOperand_1 = require("./operand/classifyOperand");
// --- 命令長の見積もり ---
function estimateInstrSize(ctx, node) {
    const defs = instrTable_1.instrTable[node.op];
    const operand = node.args.map(s => (0, classifyOperand_1.classifyOperand)(ctx, s));
    if (defs) {
        for (const def of defs) {
            if (def.match(ctx, operand)) {
                if (typeof def.estimate === "function") {
                    return def.estimate(ctx, operand, node);
                }
                else {
                    return def.estimate ?? 1;
                }
            }
        }
    }
    return 1;
}
function encodeInstr(ctx, node) {
    const defs = instrTable_1.instrTable[node.op];
    const operand = node.args.map(s => (0, classifyOperand_1.classifyOperand)(ctx, s));
    // console.log(`node:${JSON.stringify(node)},operand:${JSON.stringify(operand)}`);
    if (defs) {
        for (const def of defs) {
            if (def.match(ctx, operand)) {
                return def.encode(ctx, operand, node);
            }
        }
    }
    // fallback
    return encodeLegacyInstr(ctx, node);
}
function getZ80OpcodeTable() {
    const table = new Map();
    const keys = Object.keys(instrTable_1.instrTable);
    for (const key of keys) {
        table.set(key.toUpperCase(), instrTable_1.instrTable[key]);
    }
    return table;
}
function encodeLegacyInstr(ctx, node) {
    const throwExtended = () => {
        const args = node.args.join(",");
        throw new Error(`Unsupported extended instruction ${node.op}${args ? " " + args : ""} (R800/Z280 not implemented)`);
    };
    switch (node.op) {
        case "LD":
            (0, ld_1.encodeLD)(ctx, node);
            break;
        case "INC":
            (0, incdec_1.encodeINC)(ctx, node);
            break;
        case "DEC":
            (0, incdec_1.encodeDEC)(ctx, node);
            break;
        case "ADD":
            (0, alu_1.encodeADD)(ctx, node);
            break;
        case "ADC":
            (0, alu_1.encodeADC)(ctx, node);
            break;
        case "SUB":
            (0, alu_1.encodeSUB)(ctx, node);
            break;
        case "SBC":
            (0, alu_1.encodeSBC)(ctx, node);
            break;
        case "AND":
            (0, alu_1.encodeAND)(ctx, node);
            break;
        case "OR":
            (0, alu_1.encodeOR)(ctx, node);
            break;
        case "XOR":
            (0, alu_1.encodeXOR)(ctx, node);
            break;
        case "CP":
            (0, alu_1.encodeCP)(ctx, node);
            break;
        // // --- Jump/Call/Return 系 ---
        // case "JP":
        //   encodeJP(ctx, node);
        //   break;
        // case "JR":
        //   encodeJR(ctx, node);
        //   break;
        // case "CALL":
        //   encodeCALL(ctx, node);
        //   break;
        // case "RET":
        //   encodeRET(ctx, node);
        //   break;
        // case "RST":
        //   encodeRST(ctx, node);
        //   break;
        // case "DJNZ":
        //   encodeDJNZ(ctx, node);
        //   break;
        case "EX":
            (0, ex_1.encodeEX)(ctx, node);
            break;
        // --- Misc 単発命令 ---
        case "NOP":
        case "HALT":
        case "DAA":
        case "CPL":
        case "SCF":
        case "CCF":
        case "DI":
        case "EI":
        case "RLCA":
        case "RRCA":
        case "RLA":
        case "RRA":
        case "EXX":
            (0, misc_1.encodeMisc)(ctx, node);
            break;
        case "RLC":
        case "RRC":
        case "RL":
        case "RR":
        case "SLA":
        case "SRA":
        case "SLL":
        case "SRL":
        case "BIT":
        case "RES":
        case "SET":
            (0, cb_1.encodeCB)(ctx, node);
            break;
        case "IN":
        case "OUT":
            (0, io_1.encodeIO)(ctx, node);
            break;
        case "LDI":
        case "LDIR":
        case "LDD":
        case "LDDR":
        case "CPI":
        case "CPIR":
        case "CPD":
        case "CPDR":
        case "INI":
        case "INIR":
        case "IND":
        case "INDR":
        case "OUTI":
        case "OTIR":
        case "OUTD":
        case "OTDR":
        case "NEG":
        case "RETN":
        case "RETI":
        case "RRD":
        case "RLD":
        case "LD": // (A,I) 等のパターンで ED 対応
        case "IM":
            (0, ed_1.encodeED)(ctx, node);
            break;
        case "PUSH":
        case "POP": {
            const defs = node.op === "PUSH" ? stack_1.pushInstr : stack_1.popInstr;
            const operand = node.args.map(s => (0, classifyOperand_1.classifyOperand)(ctx, s));
            for (const def of defs) {
                if (def.match(ctx, operand)) {
                    return def.encode(ctx, operand, node);
                }
            }
            throw new Error(`Unsupported ${node.op} form at line ${node.pos.line}`);
        }
        // --- Extended ISA (R800/Z280 etc.) ---
        case "MULUB":
        case "MULUW":
        case "SLP":
        case "MLT":
        case "IN0":
        case "OUT0":
        case "INO":
        case "OUTO":
        case "OTIM":
        case "OTIMR":
        case "OTDM":
        case "OTDMR":
        case "TSTIO":
        case "TST":
        case "MULT":
        case "MULTU":
        case "MULTW":
        case "DIV":
        case "DIVU":
        case "JAF":
        case "JAR":
        case "LDUP":
        case "LOUD":
            throwExtended();
            break;
        default:
            throw new Error(`Unsupported instruction ${node.op} at line ${node.pos.line}`);
    }
}
