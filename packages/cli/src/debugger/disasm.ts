import { formatHex } from "./core";

export type Decoded = { size: number; text: string; target?: number };

export function decodeOne(buf: Uint8Array, offset: number, addr: number): Decoded {
  const b0 = buf[offset];
  const b1 = offset + 1 < buf.length ? buf[offset + 1] : 0;
  const b2 = offset + 2 < buf.length ? buf[offset + 2] : 0;
  const b3 = offset + 3 < buf.length ? buf[offset + 3] : 0;
  const u16 = (lo: number, hi: number) => (lo | (hi << 8)) & 0xffff;
  const rel8 = (v: number) => (v & 0x80) ? v - 0x100 : v;

  if (b0 === 0xc3) return { size: 3, text: `JP ${formatHex(u16(b1, b2))}H`, target: u16(b1, b2) };
  if (b0 === 0xcd) return { size: 3, text: `CALL ${formatHex(u16(b1, b2))}H`, target: u16(b1, b2) };
  if (b0 === 0x10) return { size: 2, text: `DJNZ ${formatHex((addr + 2 + rel8(b1)) & 0xffff)}H`, target: (addr + 2 + rel8(b1)) & 0xffff };
  if (b0 === 0x18) return { size: 2, text: `JR ${formatHex((addr + 2 + rel8(b1)) & 0xffff)}H`, target: (addr + 2 + rel8(b1)) & 0xffff };
  if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
    const cc = b0 === 0x20 ? "NZ" : b0 === 0x28 ? "Z" : b0 === 0x30 ? "NC" : "C";
    const nn = (addr + 2 + rel8(b1)) & 0xffff;
    return { size: 2, text: `JR ${cc},${formatHex(nn)}H`, target: nn };
  }
  if (b0 === 0x21) return { size: 3, text: `LD HL,${formatHex(u16(b1, b2))}H` };
  if (b0 === 0x11) return { size: 3, text: `LD DE,${formatHex(u16(b1, b2))}H` };
  if (b0 === 0x0e) return { size: 2, text: `LD C,${formatHex(b1, 2)}H` };
  if (b0 === 0x1e) return { size: 2, text: `LD E,${formatHex(b1, 2)}H` };
  if (b0 === 0x06) return { size: 2, text: `LD B,${formatHex(b1, 2)}H` };
  if (b0 === 0x31) return { size: 3, text: `LD SP,${formatHex(u16(b1, b2))}H` };
  if (b0 === 0xf9) return { size: 1, text: "LD SP,HL" };
  if (b0 === 0x36) return { size: 2, text: `LD (HL),${formatHex(b1, 2)}H` };
  if (b0 === 0x23) return { size: 1, text: "INC HL" };
  if (b0 === 0x2c) return { size: 1, text: "INC L" };
  if (b0 === 0x35) return { size: 1, text: "DEC (HL)" };
  if (b0 === 0xaf) return { size: 1, text: "XOR A" };
  if (b0 === 0x77) return { size: 1, text: "LD (HL),A" };
  if (b0 === 0x4e) return { size: 1, text: "LD C,(HL)" };
  if (b0 === 0x3e) return { size: 2, text: `LD A,${formatHex(b1, 2)}H` };
  if (b0 === 0x7e) return { size: 1, text: "LD A,(HL)" };
  if (b0 === 0x5f) return { size: 1, text: "LD E,A" };
  if (b0 === 0xe6) return { size: 2, text: `AND ${formatHex(b1, 2)}H` };
  if (b0 === 0xf6) return { size: 2, text: `OR ${formatHex(b1, 2)}H` };
  if (b0 === 0x80) return { size: 1, text: "ADD A,B" };
  if (b0 === 0xb9) return { size: 1, text: "CP C" };
  if (b0 === 0xc9) return { size: 1, text: "RET" };
  if (b0 === 0xf0) return { size: 1, text: "RET P" };
  if (b0 === 0xeb) return { size: 1, text: "EX DE,HL" };
  if (b0 === 0xc7) return { size: 1, text: "RST 0" };
  if (b0 === 0xcc) return { size: 3, text: `CALL Z,${formatHex(u16(b1, b2))}H`, target: u16(b1, b2) };
  if (b0 === 0x22) return { size: 3, text: `LD (${formatHex(u16(b1, b2))}H),HL` };
  if (b0 === 0x2a) return { size: 3, text: `LD HL,(${formatHex(u16(b1, b2))}H)` };
  if (b0 === 0x32) return { size: 3, text: `LD (${formatHex(u16(b1, b2))}H),A` };
  if (b0 === 0x3a) return { size: 3, text: `LD A,(${formatHex(u16(b1, b2))}H)` };
  if (b0 === 0xcb && b1 === 0xbe) return { size: 2, text: "RES 7,(HL)" };
  if (b0 === 0xdd && b1 === 0x21) return { size: 4, text: `LD IX,${formatHex(u16(b2, b3))}H` };
  if (b0 === 0xfd && b1 === 0x21) return { size: 4, text: `LD IY,${formatHex(u16(b2, b3))}H` };
  if (b0 === 0xed && b1 === 0xb0) return { size: 2, text: "LDIR" };
  if (b0 === 0xed && b1 === 0x62) return { size: 2, text: "SBC HL,HL" };
  if (b0 === 0xed && b1 === 0x53) return { size: 4, text: `LD (${formatHex(u16(b2, b3))}H),DE` };
  if (b0 === 0xed && b1 === 0x5b) return { size: 4, text: `LD DE,(${formatHex(u16(b2, b3))}H)` };
  if (b0 === 0xed && b1 === 0x43) return { size: 4, text: `LD (${formatHex(u16(b2, b3))}H),BC` };
  if (b0 === 0xed && b1 === 0x4b) return { size: 4, text: `LD BC,(${formatHex(u16(b2, b3))}H)` };
  if (b0 === 0xed && b1 === 0x73) return { size: 4, text: `LD (${formatHex(u16(b2, b3))}H),SP` };
  if (b0 === 0xed && b1 === 0x7b) return { size: 4, text: `LD SP,(${formatHex(u16(b2, b3))}H)` };
  return { size: 1, text: `DB ${formatHex(b0, 2)}H` };
}
