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
  test("unsupported LD form → error", () => {
    const ctx = makeCtx();
    expect(() => encodeInstr(ctx, makeNode("LD", ["HL", "A"]))).toThrow(
      /Unsupported LD/
    );
  });
});

// describe("Misc", () => {
//   test("NOP → 00", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("NOP", []));
//     expect(ctx.texts[0].data).toEqual([0x00]);
//   });

//   test("HALT → 76", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("HALT", []));
//     expect(ctx.texts[0].data).toEqual([0x76]);
//   });

//   test("DAA → 27", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("DAA", []));
//     expect(ctx.texts[0].data).toEqual([0x27]);
//   });

//   test("CPL → 2F", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("CPL", []));
//     expect(ctx.texts[0].data).toEqual([0x2f]);
//   });

//   test("SCF → 37", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("SCF", []));
//     expect(ctx.texts[0].data).toEqual([0x37]);
//   });

//   test("CCF → 3F", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("CCF", []));
//     expect(ctx.texts[0].data).toEqual([0x3f]);
//   });

//   test("DI → F3", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("DI", []));
//     expect(ctx.texts[0].data).toEqual([0xf3]);
//   });

//   test("EI → FB", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("EI", []));
//     expect(ctx.texts[0].data).toEqual([0xfb]);
//   });

//   test("RLCA → 07", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RLCA", []));
//     expect(ctx.texts[0].data).toEqual([0x07]);
//   });

//   test("RRCA → 0F", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RRCA", []));
//     expect(ctx.texts[0].data).toEqual([0x0f]);
//   });

//   test("RLA → 17", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RLA", []));
//     expect(ctx.texts[0].data).toEqual([0x17]);
//   });

//   test("RRA → 1F", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RRA", []));
//     expect(ctx.texts[0].data).toEqual([0x1f]);
//   });
// });

// describe("CB prefix", () => {
//   // --- Rotate/Shift ---
//   test("RRC A → CB 0F", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RRC", ["A"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x0f]);
//   });

//   test("RL (HL) → CB 16", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RL", ["(HL)"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x16]);
//   });

//   test("RR E → CB 1B", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RR", ["E"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x1b]);
//   });

//   test("SRA H → CB 2C", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("SRA", ["H"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x2c]);
//   });

//   test("SLL L → CB 35", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("SLL", ["L"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x35]);
//   });

//   test("RLC B → CB 00", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RLC", ["B"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x00]);
//   });

//   test("SLA C → CB 21", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("SLA", ["C"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x21]);
//   });

//   test("SRL D → CB 3A", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("SRL", ["D"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x3a]);
//   });

//   // --- BIT/RES/SET ---
//   test("BIT 0,B → CB 40", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("BIT", ["0", "B"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x40]);
//   });

//   test("BIT 7,H → CB 7C", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("BIT", ["7", "H"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x7c]);
//   });

//   test("SET 0,L → CB C5", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("SET", ["0", "L"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0xc5]);
//   });

//   test("RES 1,A → CB 8F", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RES", ["1", "A"]));
//     expect(ctx.texts[0].data).toEqual([0xcb, 0x8f]);
//   });
// });

// describe("ED prefix", () => {
//   test("LDI → ED A0", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("LDI", []));
//     expect(ctx.texts[0].data).toEqual([0xed, 0xa0]);
//   });

//   test("LDIR → ED B0", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("LDIR", []));
//     expect(ctx.texts[0].data).toEqual([0xed, 0xb0]);
//   });

//   // test("IN A,(12H) → DB 12", () => {
//   //   const ctx = makeCtx();
//   //   encodeInstr(ctx, makeNode("IN", ["A", "(12H)"]));
//   //   expect(ctx.texts[0].data).toEqual([0xdb, 0x12]);
//   // });

//   // test("OUT (34H),A → D3 34", () => {
//   //   const ctx = makeCtx();
//   //   encodeInstr(ctx, makeNode("OUT", ["(34H)", "A"]));
//   //   expect(ctx.texts[0].data).toEqual([0xd3, 0x34]);
//   // });

//   // --- I/R レジスタ ---
//   test("LD A,I → ED 57", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("LD", ["A", "I"]));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x57]);
//   });

//   test("LD I,A → ED 47", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("LD", ["I", "A"]));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x47]);
//   });

//   test("LD A,R → ED 5F", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("LD", ["A", "R"]));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x5F]);
//   });

//   test("LD R,A → ED 4F", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("LD", ["R", "A"]));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x4F]);
//   });

//   // --- 割り込み制御 ---
//   test("RETN → ED 45", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RETN", []));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x45]);
//   });

//   test("RETI → ED 4D", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RETI", []));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x4D]);
//   });

//   test("IM 0 → ED 46", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("IM", ["0"]));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x46]);
//   });

//   test("IM 1 → ED 56", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("IM", ["1"]));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x56]);
//   });

//   test("IM 2 → ED 5E", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("IM", ["2"]));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x5E]);
//   });
// });

// describe("ED prefix (misc)", () => {
//   test("NEG → ED 44", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("NEG", []));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x44]);
//   });

//   test("RRD → ED 67", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RRD", []));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x67]);
//   });

//   test("RLD → ED 6F", () => {
//     const ctx = makeCtx();
//     encodeInstr(ctx, makeNode("RLD", []));
//     expect(ctx.texts[0].data).toEqual([0xED, 0x6F]);
//   });
// });

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
