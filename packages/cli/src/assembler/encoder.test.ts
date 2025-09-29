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
    expect(ctx.texts[0].data).toEqual([0x3E, 0x01]);
  });

  test("LD A,'A' → 3E 41", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "65"])); // tokenizerが 'A' → 65 に変換
    expect(ctx.texts[0].data).toEqual([0x3E, 0x41]);
  });

  test("LD A,'#' → 3E 23", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "35"])); // '#' = 35
    expect(ctx.texts[0].data).toEqual([0x3E, 0x23]);
  });

  test("LD B,A → 47", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["B", "A"]));
    expect(ctx.texts[0].data).toEqual([0x47]);
  });

  test("CALL 1234 → CD 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CALL", ["1234"]));
    expect(ctx.texts[0].data).toEqual([0xCD, 0xD2, 0x04]);
  });

  test("CALL BDOS → unresolved", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CALL", ["BDOS"]));
    expect(ctx.texts[0].data).toEqual([0xCD, 0x00, 0x00]);
    expect(ctx.unresolved).toEqual([
      { addr: 1, symbol: "BDOS", size: 2 }
    ]);
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
    expect(ctx.texts[0].data).toEqual([0x18, 0xEE]); // -18 = 0xEE
  });

  test("unsupported LD form → error", () => {
    const ctx = makeCtx();
    expect(() => encodeInstr(ctx, makeNode("LD", ["(HL)", "A"])))
      .toThrow(/Unsupported LD/);
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
    expect(ctx.texts[0].data).toEqual([0x3E, 0x01]);
  });

  test("LD A,(HL) → 7E", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "(HL)"]));
    expect(ctx.texts[0].data).toEqual([0x7E]);
  });

  test("LD (HL),A → 77", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(HL)", "A"]));
    expect(ctx.texts[0].data).toEqual([0x77]);
  });

  test("LD A,(1234H) → 3A 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0x3A, 0x34, 0x12]);
  });

  test("LD (1234H),A → 32 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["1234H", "A"]));
    expect(ctx.texts[0].data).toEqual([0x32, 0x34, 0x12]);
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
    expect(ctx.texts[0].data).toEqual([0xC6, 0x01]);
  });

  test("SUB B → 90", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SUB", ["B"]));
    expect(ctx.texts[0].data).toEqual([0x90]);
  });

  test("AND C → A1", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("AND", ["C"]));
    expect(ctx.texts[0].data).toEqual([0xA1]);
  });

  test("OR D → B2", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("OR", ["D"]));
    expect(ctx.texts[0].data).toEqual([0xB2]);
  });

  test("XOR E → AB", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("XOR", ["E"]));
    expect(ctx.texts[0].data).toEqual([0xAB]);
  });

  test("CP 1 → FE 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CP", ["1"]));
    expect(ctx.texts[0].data).toEqual([0xFE, 0x01]);
  });

  test("INC A → 3C", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["A"]));
    expect(ctx.texts[0].data).toEqual([0x3C]);
  });

  test("DEC B → 05", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["B"]));
    expect(ctx.texts[0].data).toEqual([0x05]);
  });
});

describe("Jump/Call/Return", () => {
  test("JP 1234H → C3 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("JP", ["1234H"]));
    expect(ctx.texts[0].data).toEqual([0xC3, 0x34, 0x12]);
  });

  test("JP Z,1234H → CA 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("JP", ["Z", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0xCA, 0x34, 0x12]);
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
    expect(ctx.texts[0].data).toEqual([0xCD, 0x34, 0x12]);
  });

  test("RET → C9", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RET", []));
    expect(ctx.texts[0].data).toEqual([0xC9]);
  });

  test("RET Z → C8", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RET", ["Z"]));
    expect(ctx.texts[0].data).toEqual([0xC8]);
  });

  test("RST 38H → FF", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RST", ["38H"]));
    expect(ctx.texts[0].data).toEqual([0xFF]);
  });
});

describe("CB prefix", () => {
  test("RLC B → CB 00", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RLC", ["B"]));
    expect(ctx.texts[0].data).toEqual([0xCB, 0x00]);
  });

  test("SLA C → CB 21", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SLA", ["C"]));
    expect(ctx.texts[0].data).toEqual([0xCB, 0x21]);
  });

  test("SRL D → CB 3A", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SRL", ["D"]));
    expect(ctx.texts[0].data).toEqual([0xCB, 0x3A]);
  });

  test("BIT 7,H → CB 7C", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("BIT", ["7", "H"]));
    expect(ctx.texts[0].data).toEqual([0xCB, 0x7C]);
  });

  test("SET 0,L → CB C5", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SET", ["0", "L"]));
    expect(ctx.texts[0].data).toEqual([0xCB, 0xC5]);
  });

  test("RES 1,A → CB 8F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RES", ["1", "A"]));
    expect(ctx.texts[0].data).toEqual([0xCB, 0x8F]);
  });
});

describe("ED prefix", () => {
  test("LDI → ED A0", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LDI", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0xA0]);
  });

  test("LDIR → ED B0", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LDIR", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0xB0]);
  });

  test("IN A,(12H) → DB 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IN", ["A", "12H"]));
    expect(ctx.texts[0].data).toEqual([0xDB, 0x12]);
  });

  test("OUT (34H),A → D3 34", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("OUT", ["34H", "A"]));
    expect(ctx.texts[0].data).toEqual([0xD3, 0x34]);
  });
});

describe("DD/FD prefix", () => {
  test("LD IX,1234H → DD 21 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["IX", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0xDD, 0x21, 0x34, 0x12]);
  });

  test("LD IY,5678H → FD 21 78 56", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["IY", "5678H"]));
    expect(ctx.texts[0].data).toEqual([0xFD, 0x21, 0x78, 0x56]);
  });

  test("ADD IX,BC → DD 09", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["IX", "BC"]));
    expect(ctx.texts[0].data).toEqual([0xDD, 0x09]);
  });

  test("ADD IY,SP → FD 39", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["IY", "SP"]));
    expect(ctx.texts[0].data).toEqual([0xFD, 0x39]);
  });

  test("LD (IX+01H),A → DD 77 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(IX+01H)", "A"]));
    expect(ctx.texts[0].data).toEqual([0xDD, 0x77, 0x01]);
  });

  test("LD A,(IY+02H) → FD 7E 02", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "(IY+02H)"]));
    expect(ctx.texts[0].data).toEqual([0xFD, 0x7E, 0x02]);
  });
});
