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
    if (b0 === 0xc3)
        return { size: 3, text: `JP ${(0, core_1.formatHex)(u16(b1, b2))}H`, target: u16(b1, b2) };
    if (b0 === 0xcd)
        return { size: 3, text: `CALL ${(0, core_1.formatHex)(u16(b1, b2))}H`, target: u16(b1, b2) };
    if (b0 === 0x18)
        return { size: 2, text: `JR ${(0, core_1.formatHex)((addr + 2 + rel8(b1)) & 0xffff)}H`, target: (addr + 2 + rel8(b1)) & 0xffff };
    if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
        const cc = b0 === 0x20 ? "NZ" : b0 === 0x28 ? "Z" : b0 === 0x30 ? "NC" : "C";
        const nn = (addr + 2 + rel8(b1)) & 0xffff;
        return { size: 2, text: `JR ${cc},${(0, core_1.formatHex)(nn)}H`, target: nn };
    }
    if (b0 === 0x21)
        return { size: 3, text: `LD HL,${(0, core_1.formatHex)(u16(b1, b2))}H` };
    if (b0 === 0x31)
        return { size: 3, text: `LD SP,${(0, core_1.formatHex)(u16(b1, b2))}H` };
    if (b0 === 0xf9)
        return { size: 1, text: "LD SP,HL" };
    if (b0 === 0x36)
        return { size: 2, text: `LD (HL),${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0x23)
        return { size: 1, text: "INC HL" };
    if (b0 === 0x2c)
        return { size: 1, text: "INC L" };
    if (b0 === 0xaf)
        return { size: 1, text: "XOR A" };
    if (b0 === 0x77)
        return { size: 1, text: "LD (HL),A" };
    if (b0 === 0x3e)
        return { size: 2, text: `LD A,${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0x7e)
        return { size: 1, text: "LD A,(HL)" };
    if (b0 === 0xe6)
        return { size: 2, text: `AND ${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0xf6)
        return { size: 2, text: `OR ${(0, core_1.formatHex)(b1, 2)}H` };
    if (b0 === 0xc9)
        return { size: 1, text: "RET" };
    if (b0 === 0x22)
        return { size: 3, text: `LD (${(0, core_1.formatHex)(u16(b1, b2))}H),HL` };
    if (b0 === 0x2a)
        return { size: 3, text: `LD HL,(${(0, core_1.formatHex)(u16(b1, b2))}H)` };
    if (b0 === 0x32)
        return { size: 3, text: `LD (${(0, core_1.formatHex)(u16(b1, b2))}H),A` };
    if (b0 === 0x3a)
        return { size: 3, text: `LD A,(${(0, core_1.formatHex)(u16(b1, b2))}H)` };
    if (b0 === 0xdd && b1 === 0x21)
        return { size: 4, text: `LD IX,${(0, core_1.formatHex)(u16(b2, b3))}H` };
    if (b0 === 0xfd && b1 === 0x21)
        return { size: 4, text: `LD IY,${(0, core_1.formatHex)(u16(b2, b3))}H` };
    if (b0 === 0xed && b1 === 0x53)
        return { size: 4, text: `LD (${(0, core_1.formatHex)(u16(b2, b3))}H),DE` };
    if (b0 === 0xed && b1 === 0x5b)
        return { size: 4, text: `LD DE,(${(0, core_1.formatHex)(u16(b2, b3))}H)` };
    if (b0 === 0xed && b1 === 0x43)
        return { size: 4, text: `LD (${(0, core_1.formatHex)(u16(b2, b3))}H),BC` };
    if (b0 === 0xed && b1 === 0x4b)
        return { size: 4, text: `LD BC,(${(0, core_1.formatHex)(u16(b2, b3))}H)` };
    if (b0 === 0xed && b1 === 0x73)
        return { size: 4, text: `LD (${(0, core_1.formatHex)(u16(b2, b3))}H),SP` };
    if (b0 === 0xed && b1 === 0x7b)
        return { size: 4, text: `LD SP,(${(0, core_1.formatHex)(u16(b2, b3))}H)` };
    return { size: 1, text: `DB ${(0, core_1.formatHex)(b0, 2)}H` };
}
