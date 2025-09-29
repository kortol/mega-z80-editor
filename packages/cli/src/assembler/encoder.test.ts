import { AsmContext } from "./context";
import { NodeInstr } from "./parser";
import { encodeInstr } from "./encoder";

function makeCtx(): AsmContext {
  return {
    loc: 0,
    moduleName: "TEST",
    symbols: new Map(),
    unresolved: [],
    modeWord32: false,
    modeSymLen: 6,
    caseInsensitive: true,
    texts: [],
  };
}

function makeNode(op: string, args: string[], line = 1): NodeInstr {
  return { kind: "instr", op, args, line };
}

describe("encoder", () => {
  test("LD A,1 → 3E 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "1"]));
    expect(ctx.texts[0].data).toEqual([0x3e, 0x01]);
  });

  test("LD A,'A' → 3E 41", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "65"])); // tokenizerが 'A' → 65 に変換
    expect(ctx.texts[0].data).toEqual([0x3e, 0x41]);
  });

  test("LD A,'#' → 3E 23", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "35"])); // '#' = 35
    expect(ctx.texts[0].data).toEqual([0x3e, 0x23]);
  });

  test("LD B,A → 47", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["B", "A"]));
    expect(ctx.texts[0].data).toEqual([0x47]);
  });

  test("CALL 1234 → CD 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CALL", ["1234"]));
    expect(ctx.texts[0].data).toEqual([0xcd, 0xd2, 0x04]);
  });

  test("CALL BDOS → unresolved", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CALL", ["BDOS"]));
    expect(ctx.texts[0].data).toEqual([0xcd, 0x00, 0x00]);
    expect(ctx.unresolved).toEqual([{ addr: 1, symbol: "BDOS", size: 2 }]);
  });

  test("JR forward offset", () => {
    const ctx = makeCtx();
    // loc = 0 の状態で "JR 10" は → offset = 10 - (0+2) = 8
    encodeInstr(ctx, makeNode("JR", ["10"]));
    expect(ctx.texts[0].data).toEqual([0x18, 0x08]);
  });

  test("JR backward offset", () => {
    const ctx = makeCtx();
    ctx.loc = 0x20;
    // "JR 0x10" → offset = 0x10 - (0x20+2) = -0x12 (signed)
    encodeInstr(ctx, makeNode("JR", ["16"]));
    expect(ctx.texts[0].data).toEqual([0x18, 0xee]); // -18 = 0xEE
  });

  test("unsupported LD form → error", () => {
    const ctx = makeCtx();
    expect(() => encodeInstr(ctx, makeNode("LD", ["HL", "A"]))).toThrow(
      /Unsupported LD/
    );
  });
});

describe("LD instructions", () => {
  test("LD A,B → 78", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "B"]));
    expect(ctx.texts[0].data).toEqual([0x78]);
  });

  test("LD A,1 → 3E 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "1"]));
    expect(ctx.texts[0].data).toEqual([0x3e, 0x01]);
  });

  test("LD A,(HL) → 7E", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "(HL)"]));
    expect(ctx.texts[0].data).toEqual([0x7e]);
  });

  test("LD (HL),A → 77", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(HL)", "A"]));
    expect(ctx.texts[0].data).toEqual([0x77]);
  });

  test("LD A,(1234H) → 3A 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0x3a, 0x34, 0x12]);
  });

  test("LD (1234H),A → 32 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["1234H", "A"]));
    expect(ctx.texts[0].data).toEqual([0x32, 0x34, 0x12]);
  });
});

describe("LD 8bit (basic)", () => {
  test("LD A,(HL) → 7E", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "(HL)"]));
    expect(ctx.texts[0].data).toEqual([0x7e]);
  });

  test("LD (HL),A → 77", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(HL)", "A"]));
    expect(ctx.texts[0].data).toEqual([0x77]);
  });

  test("LD A,(1234H) → 3A 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0x3a, 0x34, 0x12]);
  });

  test("LD (1234H),A → 32 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["1234H", "A"]));
    expect(ctx.texts[0].data).toEqual([0x32, 0x34, 0x12]);
  });
});

describe("LD 16bit", () => {
  test("LD HL,1234H → 21 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["HL", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0x21, 0x34, 0x12]);
  });

  test("LD DE,5678H → 11 78 56", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["DE", "5678H"]));
    expect(ctx.texts[0].data).toEqual([0x11, 0x78, 0x56]);
  });

  test("LD (1234H),HL → 22 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(1234H)", "HL"]));
    expect(ctx.texts[0].data).toEqual([0x22, 0x34, 0x12]);
  });

  test("LD HL,(1234H) → 2A 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["HL", "(1234H)"]));
    expect(ctx.texts[0].data).toEqual([0x2a, 0x34, 0x12]);
  });

  test("LD SP,HL → F9", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["SP", "HL"]));
    expect(ctx.texts[0].data).toEqual([0xf9]);
  });
});

describe("Arithmetic and Logic", () => {
  test("ADD A,B → 80", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["A", "B"]));
    expect(ctx.texts[0].data).toEqual([0x80]);
  });

  test("ADD A,1 → C6 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["A", "1"]));
    expect(ctx.texts[0].data).toEqual([0xc6, 0x01]);
  });

  test("SUB B → 90", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SUB", ["B"]));
    expect(ctx.texts[0].data).toEqual([0x90]);
  });

  test("AND C → A1", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("AND", ["C"]));
    expect(ctx.texts[0].data).toEqual([0xa1]);
  });

  test("OR D → B2", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("OR", ["D"]));
    expect(ctx.texts[0].data).toEqual([0xb2]);
  });

  test("XOR E → AB", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("XOR", ["E"]));
    expect(ctx.texts[0].data).toEqual([0xab]);
  });

  test("CP 1 → FE 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CP", ["1"]));
    expect(ctx.texts[0].data).toEqual([0xfe, 0x01]);
  });

  test("INC A → 3C", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["A"]));
    expect(ctx.texts[0].data).toEqual([0x3c]);
  });

  test("DEC B → 05", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["B"]));
    expect(ctx.texts[0].data).toEqual([0x05]);
  });
});

// --- 16bit Arithmetic (non-ED) ---
describe("16bit Arithmetic", () => {
  test("ADD HL,BC → 09", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["HL", "BC"]));
    expect(ctx.texts[0].data).toEqual([0x09]);
  });

  test("ADD HL,DE → 19", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["HL", "DE"]));
    expect(ctx.texts[0].data).toEqual([0x19]);
  });

  test("ADD HL,HL → 29", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["HL", "HL"]));
    expect(ctx.texts[0].data).toEqual([0x29]);
  });

  test("ADD HL,SP → 39", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["HL", "SP"]));
    expect(ctx.texts[0].data).toEqual([0x39]);
  });

  test("INC BC → 03", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["BC"]));
    expect(ctx.texts[0].data).toEqual([0x03]);
  });

  test("INC DE → 13", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["DE"]));
    expect(ctx.texts[0].data).toEqual([0x13]);
  });

  test("INC HL → 23", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["HL"]));
    expect(ctx.texts[0].data).toEqual([0x23]);
  });

  test("INC SP → 33", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["SP"]));
    expect(ctx.texts[0].data).toEqual([0x33]);
  });

  test("DEC BC → 0B", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["BC"]));
    expect(ctx.texts[0].data).toEqual([0x0b]);
  });

  test("DEC DE → 1B", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["DE"]));
    expect(ctx.texts[0].data).toEqual([0x1b]);
  });

  test("DEC HL → 2B", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["HL"]));
    expect(ctx.texts[0].data).toEqual([0x2b]);
  });

  test("DEC SP → 3B", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["SP"]));
    expect(ctx.texts[0].data).toEqual([0x3b]);
  });
});

describe("Jump/Call/Return", () => {
  test("JP 1234H → C3 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("JP", ["1234H"]));
    expect(ctx.texts[0].data).toEqual([0xc3, 0x34, 0x12]);
  });

  test("JP Z,1234H → CA 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("JP", ["Z", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0xca, 0x34, 0x12]);
  });

  test("JR 10 → 18 08", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("JR", ["10"]));
    expect(ctx.texts[0].data).toEqual([0x18, 0x08]);
  });

  test("JR NZ,10 → 20 08", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("JR", ["NZ", "10"]));
    expect(ctx.texts[0].data).toEqual([0x20, 0x08]);
  });

  test("CALL 1234H → CD 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CALL", ["1234H"]));
    expect(ctx.texts[0].data).toEqual([0xcd, 0x34, 0x12]);
  });

  test("RET → C9", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RET", []));
    expect(ctx.texts[0].data).toEqual([0xc9]);
  });

  test("RET Z → C8", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RET", ["Z"]));
    expect(ctx.texts[0].data).toEqual([0xc8]);
  });

  test("RST 38H → FF", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RST", ["38H"]));
    expect(ctx.texts[0].data).toEqual([0xff]);
  });

  test("JP (HL) → E9", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("JP", ["(HL)"]));
    expect(ctx.texts[0].data).toEqual([0xe9]);
  });

  test("JP (IX) → DD E9", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("JP", ["(IX)"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0xe9]);
  });

  test("DJNZ 20H → 10 1E", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DJNZ", ["20H"]));
    expect(ctx.texts[0].data).toEqual([0x10, 0x1e]);
  });

  test("CALL Z,1234H → CC 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CALL", ["Z", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0xcc, 0x34, 0x12]);
  });

  test("RET NC → D0", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RET", ["NC"]));
    expect(ctx.texts[0].data).toEqual([0xd0]);
  });
});

describe("EX/EXX encodeInstr", () => {
  it("EX AF,AF' → 08", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["AF", "AF'"]));
    expect(ctx.texts[0].data).toEqual([0x08]);
  });

  it("EX DE,HL → EB", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["DE", "HL"]));
    expect(ctx.texts[0].data).toEqual([0xeb]);
  });

  it("EX (SP),HL → E3", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["(SP)", "HL"]));
    expect(ctx.texts[0].data).toEqual([0xe3]);
  });

  it("EX (SP),IX → DD E3", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["(SP)", "IX"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0xe3]);
  });

  it("EX (SP),IY → FD E3", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["(SP)", "IY"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0xe3]);
  });

  it("EXX → D9", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EXX", []));
    expect(ctx.texts[0].data).toEqual([0xd9]);
  });
});
// src/assembler/encoder.test.ts

describe("Misc", () => {
  test("NOP → 00", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("NOP", []));
    expect(ctx.texts[0].data).toEqual([0x00]);
  });

  test("HALT → 76", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("HALT", []));
    expect(ctx.texts[0].data).toEqual([0x76]);
  });

  test("DAA → 27", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DAA", []));
    expect(ctx.texts[0].data).toEqual([0x27]);
  });

  test("CPL → 2F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CPL", []));
    expect(ctx.texts[0].data).toEqual([0x2f]);
  });

  test("SCF → 37", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SCF", []));
    expect(ctx.texts[0].data).toEqual([0x37]);
  });

  test("CCF → 3F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CCF", []));
    expect(ctx.texts[0].data).toEqual([0x3f]);
  });

  test("DI → F3", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DI", []));
    expect(ctx.texts[0].data).toEqual([0xf3]);
  });

  test("EI → FB", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EI", []));
    expect(ctx.texts[0].data).toEqual([0xfb]);
  });

  test("RLCA → 07", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RLCA", []));
    expect(ctx.texts[0].data).toEqual([0x07]);
  });

  test("RRCA → 0F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RRCA", []));
    expect(ctx.texts[0].data).toEqual([0x0f]);
  });

  test("RLA → 17", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RLA", []));
    expect(ctx.texts[0].data).toEqual([0x17]);
  });

  test("RRA → 1F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RRA", []));
    expect(ctx.texts[0].data).toEqual([0x1f]);
  });
});

describe("CB prefix", () => {
  // --- Rotate/Shift ---
  test("RRC A → CB 0F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RRC", ["A"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x0f]);
  });

  test("RL (HL) → CB 16", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RL", ["(HL)"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x16]);
  });

  test("RR E → CB 1B", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RR", ["E"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x1b]);
  });

  test("SRA H → CB 2C", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SRA", ["H"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x2c]);
  });

  test("SLL L → CB 35", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SLL", ["L"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x35]);
  });

  test("RLC B → CB 00", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RLC", ["B"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x00]);
  });

  test("SLA C → CB 21", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SLA", ["C"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x21]);
  });

  test("SRL D → CB 3A", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SRL", ["D"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x3a]);
  });

  // --- BIT/RES/SET ---
  test("BIT 0,B → CB 40", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("BIT", ["0", "B"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x40]);
  });

  test("BIT 7,H → CB 7C", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("BIT", ["7", "H"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x7c]);
  });

  test("SET 0,L → CB C5", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SET", ["0", "L"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0xc5]);
  });

  test("RES 1,A → CB 8F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RES", ["1", "A"]));
    expect(ctx.texts[0].data).toEqual([0xcb, 0x8f]);
  });
});

describe("ED prefix", () => {
  test("LDI → ED A0", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LDI", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xa0]);
  });

  test("LDIR → ED B0", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LDIR", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xb0]);
  });

  test("IN A,(12H) → DB 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IN", ["A", "(12H)"]));
    expect(ctx.texts[0].data).toEqual([0xdb, 0x12]);
  });

  test("OUT (34H),A → D3 34", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("OUT", ["(34H)", "A"]));
    expect(ctx.texts[0].data).toEqual([0xd3, 0x34]);
  });

  // --- I/R レジスタ ---
  test("LD A,I → ED 57", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "I"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x57]);
  });

  test("LD I,A → ED 47", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["I", "A"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x47]);
  });

  test("LD A,R → ED 5F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "R"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x5F]);
  });

  test("LD R,A → ED 4F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["R", "A"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x4F]);
  });

  // --- 割り込み制御 ---
  test("RETN → ED 45", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RETN", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x45]);
  });

  test("RETI → ED 4D", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RETI", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x4D]);
  });

  test("IM 0 → ED 46", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IM", ["0"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x46]);
  });

  test("IM 1 → ED 56", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IM", ["1"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x56]);
  });

  test("IM 2 → ED 5E", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IM", ["2"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x5E]);
  });
});

describe("ED prefix (misc)", () => {
  test("NEG → ED 44", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("NEG", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x44]);
  });

  test("RRD → ED 67", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RRD", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x67]);
  });

  test("RLD → ED 6F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RLD", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x6F]);
  });
});

describe("DD/FD prefix", () => {
  test("LD IX,1234H → DD 21 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["IX", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x21, 0x34, 0x12]);
  });

  test("LD IY,5678H → FD 21 78 56", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["IY", "5678H"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x21, 0x78, 0x56]);
  });

  test("ADD IX,BC → DD 09", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["IX", "BC"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x09]);
  });

  test("ADD IY,SP → FD 39", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["IY", "SP"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x39]);
  });

  test("LD (IX+01H),A → DD 77 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(IX+01H)", "A"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x77, 0x01]);
  });

  test("LD A,(IY+02H) → FD 7E 02", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "(IY+02H)"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x7e, 0x02]);
  });
});
