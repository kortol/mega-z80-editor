"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeOne = decodeOne;
const core_1 = require("./core");
function decodeOne(buf, offset, addr) {
    const b0 = buf[offset];
    const b1 = offset + 1 < buf.length ? buf[offset + 1] : 0;
    const b2 = offset + 2 < buf.length ? buf[offset + 2] : 0;
    const b3 = offset + 3 < buf.length ? buf[offset + 3] : 0;
    const u16 = (lo, hi) => (lo | (hi << 8)) & 0xffff;
    const rel8 = (v) => (v & 0x80) ? v - 0x100 : v;
    const reg8 = (code) => ["B", "C", "D", "E", "H", "L", "(HL)", "A"][code & 7];
    const reg16 = (code) => ["BC", "DE", "HL", "SP"][code & 3];
    const cc = (code) => ["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"][code & 7];
    const disp = (v) => (v & 0x80) ? v - 0x100 : v;
    const fmtDisp = (d) => d < 0 ? `-${(0, core_1.formatHex)((-d) & 0xff, 2)}H` : `+${(0, core_1.formatHex)(d & 0xff, 2)}H`;
    if (b0 === 0x00)
        return { size: 1, text: "NOP" };
    // JP / CALL
    if (b0 === 0xc3)
        return { size: 3, text: `JP ${(0, core_1.formatHex)(u16(b1, b2))}H`, target: u16(b1, b2) };
    if ((b0 & 0xc7) === 0xc2 && b0 !== 0xc3) {
        const cond = cc((b0 >> 3) & 7);
        const nn = u16(b1, b2);
        return { size: 3, text: `JP ${cond},${(0, core_1.formatHex)(nn)}H`, target: nn };
    }
    if (b0 === 0xcd)
        return { size: 3, text: `CALL ${(0, core_1.formatHex)(u16(b1, b2))}H`, target: u16(b1, b2) };
    if ((b0 & 0xc7) === 0xc4 && b0 !== 0xcd) {
        const cond = cc((b0 >> 3) & 7);
        const nn = u16(b1, b2);
        return { size: 3, text: `CALL ${cond},${(0, core_1.formatHex)(nn)}H`, target: nn };
    }
    // JR / DJNZ
    if (b0 === 0x10)
        return { size: 2, text: `DJNZ ${(0, core_1.formatHex)((addr + 2 + rel8(b1)) & 0xffff)}H`, target: (addr + 2 + rel8(b1)) & 0xffff };
    if (b0 === 0x18)
        return { size: 2, text: `JR ${(0, core_1.formatHex)((addr + 2 + rel8(b1)) & 0xffff)}H`, target: (addr + 2 + rel8(b1)) & 0xffff };
    if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
        const cc = b0 === 0x20 ? "NZ" : b0 === 0x28 ? "Z" : b0 === 0x30 ? "NC" : "C";
        const nn = (addr + 2 + rel8(b1)) & 0xffff;
        return { size: 2, text: `JR ${cc},${(0, core_1.formatHex)(nn)}H`, target: nn };
    }
    // LD rr,nn
    if ((b0 & 0xcf) === 0x01)
        return { size: 3, text: `LD ${reg16((b0 >> 4) & 3)},${(0, core_1.formatHex)(u16(b1, b2))}H` };
    // INC/DEC rr
    if ((b0 & 0xcf) === 0x03)
        return { size: 1, text: `INC ${reg16((b0 >> 4) & 3)}` };
    if ((b0 & 0xcf) === 0x0b)
        return { size: 1, text: `DEC ${reg16((b0 >> 4) & 3)}` };
    // ADD HL,rr
    if ((b0 & 0xcf) === 0x09)
        return { size: 1, text: `ADD HL,${reg16((b0 >> 4) & 3)}` };
    // INC/DEC r
    if ((b0 & 0xc7) === 0x04)
        return { size: 1, text: `INC ${reg8((b0 >> 3) & 7)}` };
    if ((b0 & 0xc7) === 0x05)
        return { size: 1, text: `DEC ${reg8((b0 >> 3) & 7)}` };
    // LD r,n
    if ((b0 & 0xc7) === 0x06)
        return { size: 2, text: `LD ${reg8((b0 >> 3) & 7)},${(0, core_1.formatHex)(b1, 2)}H` };
    // LD r,r'
    if (b0 >= 0x40 && b0 <= 0x7f && b0 !== 0x76)
        return { size: 1, text: `LD ${reg8((b0 >> 3) & 7)},${reg8(b0 & 7)}` };
    if (b0 === 0xf9)
        return { size: 1, text: "LD SP,HL" };
    if (b0 === 0x22)
        return { size: 3, text: `LD (${(0, core_1.formatHex)(u16(b1, b2))}H),HL` };
    if (b0 === 0x2a)
        return { size: 3, text: `LD HL,(${(0, core_1.formatHex)(u16(b1, b2))}H)` };
    if (b0 === 0x32)
        return { size: 3, text: `LD (${(0, core_1.formatHex)(u16(b1, b2))}H),A` };
    if (b0 === 0x3a)
        return { size: 3, text: `LD A,(${(0, core_1.formatHex)(u16(b1, b2))}H)` };
    // ALU
    if (b0 >= 0x80 && b0 <= 0x87)
        return { size: 1, text: `ADD A,${reg8(b0)}` };
    if (b0 === 0x07)
        return { size: 1, text: "RLCA" };
    if (b0 === 0x0f)
        return { size: 1, text: "RRCA" };
    if (b0 === 0x17)
        return { size: 1, text: "RLA" };
    if (b0 === 0x1f)
        return { size: 1, text: "RRA" };
    if (b0 === 0x2f)
        return { size: 1, text: "CPL" };
    if (b0 === 0x37)
        return { size: 1, text: "SCF" };
    if (b0 === 0x3f)
        return { size: 1, text: "CCF" };
    if (b0 >= 0x88 && b0 <= 0x8f)
        return { size: 1, text: `ADC A,${reg8(b0)}` };
    if (b0 >= 0x90 && b0 <= 0x97)
        return { size: 1, text: `SUB ${reg8(b0)}` };
    if (b0 >= 0x98 && b0 <= 0x9f)
        return { size: 1, text: `SBC A,${reg8(b0)}` };
    if (b0 >= 0xa0 && b0 <= 0xa7)
        return { size: 1, text: `AND ${reg8(b0)}` };
    if (b0 >= 0xa8 && b0 <= 0xaf)
        return { size: 1, text: `XOR ${reg8(b0)}` };
    if (b0 >= 0xb0 && b0 <= 0xb7)
        return { size: 1, text: `OR ${reg8(b0)}` };
    if (b0 >= 0xb8 && b0 <= 0xbf)
        return { size: 1, text: `CP ${reg8(b0)}` };
    if (b0 === 0xc6)
        return { size: 2, text: `ADD A,${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0xce)
        return { size: 2, text: `ADC A,${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0xd6)
        return { size: 2, text: `SUB ${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0xde)
        return { size: 2, text: `SBC A,${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0xe6)
        return { size: 2, text: `AND ${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0xee)
        return { size: 2, text: `XOR ${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0xf6)
        return { size: 2, text: `OR ${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0xfe)
        return { size: 2, text: `CP ${(0, core_1.formatHex)(b1, 2)}H` };
    // RET / PUSH / POP
    if (b0 === 0xc9)
        return { size: 1, text: "RET" };
    if ((b0 & 0xc7) === 0xc0 && b0 !== 0xc9)
        return { size: 1, text: `RET ${cc((b0 >> 3) & 7)}` };
    if ((b0 & 0xcf) === 0xc5)
        return { size: 1, text: `PUSH ${["BC", "DE", "HL", "AF"][(b0 >> 4) & 3]}` };
    if ((b0 & 0xcf) === 0xc1)
        return { size: 1, text: `POP ${["BC", "DE", "HL", "AF"][(b0 >> 4) & 3]}` };
    // Misc
    if (b0 === 0x76)
        return { size: 1, text: "HALT" };
    if (b0 === 0x08)
        return { size: 1, text: "EX AF,AF'" };
    if (b0 === 0xeb)
        return { size: 1, text: "EX DE,HL" };
    if (b0 === 0xe3)
        return { size: 1, text: "EX (SP),HL" };
    if (b0 === 0xd9)
        return { size: 1, text: "EXX" };
    if (b0 === 0xe9)
        return { size: 1, text: "JP (HL)" };
    if ((b0 & 0xc7) === 0xc7)
        return { size: 1, text: `RST ${(0, core_1.formatHex)(b0 & 0x38, (b0 & 0x38) ? 2 : 1)}H` };
    // CB
    if (b0 === 0xcb) {
        const reg = ["B", "C", "D", "E", "H", "L", "(HL)", "A"][b1 & 7];
        const y = (b1 >> 3) & 7;
        const grp = (b1 >> 6) & 3;
        if (grp === 0) {
            const op = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"][y];
            return { size: 2, text: `${op} ${reg}` };
        }
        if (grp === 1)
            return { size: 2, text: `BIT ${y},${reg}` };
        if (grp === 2)
            return { size: 2, text: `RES ${y},${reg}` };
        return { size: 2, text: `SET ${y},${reg}` };
    }
    // DD/FD (subset used by core)
    if (b0 === 0xdd || b0 === 0xfd) {
        const idx = b0 === 0xfd ? "IY" : "IX";
        if (b1 === 0xcb) {
            const reg = ["B", "C", "D", "E", "H", "L", "", "A"][b3 & 7];
            const y = (b3 >> 3) & 7;
            const grp = (b3 >> 6) & 3;
            const opnd = `(${idx}${fmtDisp(disp(b2))})`;
            if (grp === 0) {
                const op = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"][y];
                return { size: 4, text: reg ? `${op} ${opnd},${reg}` : `${op} ${opnd}` };
            }
            if (grp === 1)
                return { size: 4, text: `BIT ${y},${opnd}` };
            if (grp === 2)
                return { size: 4, text: reg ? `RES ${y},${opnd},${reg}` : `RES ${y},${opnd}` };
            return { size: 4, text: reg ? `SET ${y},${opnd},${reg}` : `SET ${y},${opnd}` };
        }
        if (b1 === 0x21)
            return { size: 4, text: `LD ${idx},${(0, core_1.formatHex)(u16(b2, b3))}H` };
        if (b1 === 0x22)
            return { size: 4, text: `LD (${(0, core_1.formatHex)(u16(b2, b3))}H),${idx}` };
        if (b1 === 0x2a)
            return { size: 4, text: `LD ${idx},(${(0, core_1.formatHex)(u16(b2, b3))}H)` };
        if (b1 === 0x36)
            return { size: 4, text: `LD (${idx}${fmtDisp(disp(b2))}),${(0, core_1.formatHex)(b3, 2)}H` };
        if (b1 === 0x34)
            return { size: 3, text: `INC (${idx}${fmtDisp(disp(b2))})` };
        if (b1 === 0x35)
            return { size: 3, text: `DEC (${idx}${fmtDisp(disp(b2))})` };
        if (b1 === 0x7e)
            return { size: 3, text: `LD A,(${idx}${fmtDisp(disp(b2))})` };
        if (b1 === 0x77)
            return { size: 3, text: `LD (${idx}${fmtDisp(disp(b2))}),A` };
        if (b1 === 0x23)
            return { size: 2, text: `INC ${idx}` };
        if (b1 === 0x2b)
            return { size: 2, text: `DEC ${idx}` };
        if (b1 === 0xe5)
            return { size: 2, text: `PUSH ${idx}` };
        if (b1 === 0xe1)
            return { size: 2, text: `POP ${idx}` };
        if (b1 === 0xf9)
            return { size: 2, text: `LD SP,${idx}` };
        if ((b1 & 0xc7) === 0x46 && b1 !== 0x76) {
            return { size: 3, text: `LD ${reg8((b1 >> 3) & 7)},(${idx}${fmtDisp(disp(b2))})` };
        }
        if ((b1 & 0xf8) === 0x70 && b1 !== 0x76) {
            return { size: 3, text: `LD (${idx}${fmtDisp(disp(b2))}),${reg8(b1 & 7)}` };
        }
        if ((b1 & 0xc7) === 0x86) {
            const op = ["ADD A", "ADC A", "SUB", "SBC A", "AND", "XOR", "OR", "CP"][(b1 >> 3) & 7];
            return { size: 3, text: `${op},(${idx}${fmtDisp(disp(b2))})` };
        }
        return { size: 2, text: `DB ${(0, core_1.formatHex)(b0, 2)}H ${(0, core_1.formatHex)(b1, 2)}H` };
    }
    // ED (subset used by core)
    if (b0 === 0xed && b1 === 0xb0)
        return { size: 2, text: "LDIR" };
    if (b0 === 0xed && b1 === 0xb8)
        return { size: 2, text: "LDDR" };
    if (b0 === 0xed && b1 === 0xb1)
        return { size: 2, text: "CPIR" };
    if (b0 === 0xed && (b1 === 0x42 || b1 === 0x52 || b1 === 0x62 || b1 === 0x72)) {
        return { size: 2, text: `SBC HL,${reg16((b1 >> 4) & 3)}` };
    }
    if (b0 === 0xed && (b1 === 0x4a || b1 === 0x5a || b1 === 0x6a || b1 === 0x7a)) {
        return { size: 2, text: `ADC HL,${reg16((b1 >> 4) & 3)}` };
    }
    if (b0 === 0xed && b1 === 0x53)
        return { size: 4, text: `LD (${(0, core_1.formatHex)(u16(b2, b3))}H),DE` };
    if (b0 === 0xed && b1 === 0x5b)
        return { size: 4, text: `LD DE,(${(0, core_1.formatHex)(u16(b2, b3))}H)` };
    if (b0 === 0xed && b1 === 0x4b)
        return { size: 4, text: `LD BC,(${(0, core_1.formatHex)(u16(b2, b3))}H)` };
    if (b0 === 0xed && b1 === 0x7b)
        return { size: 4, text: `LD SP,(${(0, core_1.formatHex)(u16(b2, b3))}H)` };
    return { size: 1, text: `DB ${(0, core_1.formatHex)(b0, 2)}H` };
}
