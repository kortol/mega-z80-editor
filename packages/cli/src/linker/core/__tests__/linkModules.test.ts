// src/linker/core/__tests__/linkModules.test.ts
import { linkModules } from "../linker";
import { RelModule } from "../types";

describe("P1-F: linkModules", () => {
  it("links two modules with extern resolution (8bit immediate form)", () => {
    const mods: RelModule[] = [
      {
        name: "A",
        symbols: [],
        // LD A,0 → 0x3E 0x00
        texts: [{ addr: 0x0100, bytes: [0x3E, 0x00] }],
        refs: [{ addr: 0x0101, sym: "BVAL+3" }], // +3 の addend を確認
        externs: ["BVAL"],
        entry: 0x0100,
      },
      {
        name: "B",
        symbols: [{ name: "BVAL", addr: 0x0410 }], // → 0x0403
        texts: [],
        refs: [],
        externs: [],
        entry: 0x0200,
      },
    ];

    const result = linkModules(mods);
    const seg = result.segments[0];
    console.log("8bit case:", seg.data);

    expect(result.entry).toBe(0x0100);
    expect(seg.data![0]).toBe(0x3E); // LD A,
    expect(seg.data![1]).toBe(0x13); // low byte of 0x0413
    // expect(seg.data![2]).toBe(0x04); // 上位バイトは今回未生成
  });

  it("links two modules with extern resolution (16bit JP addr form)", () => {
    const mods: RelModule[] = [
      {
        name: "A",
        symbols: [],
        // JP 0000h → 0xC3 0x00 0x00
        texts: [{ addr: 0x0200, bytes: [0xC3, 0x00, 0x00] }],
        refs: [{ addr: 0x0201, sym: "BVAL+5" }], // JP (BVAL+5)
        externs: ["BVAL"],
        entry: 0x0200,
      },
      {
        name: "B",
        symbols: [{ name: "BVAL", addr: 0x1234 }], // → 0x1239
        texts: [],
        refs: [],
        externs: [],
        entry: 0x0000,
      },
    ];

    const result = linkModules(mods);
    const seg = result.segments[0];
    console.log("16bit case:", seg.data);

    // 0x1234 + 5 = 0x1239 → 下位:0x39 上位:0x12
    expect(seg.data![0]).toBe(0xC3); // JP
    expect(seg.data![1]).toBe(0x39); // low byte
    expect(seg.data![2]).toBe(0x12); // high byte
  });

  it("warns unresolved symbol", () => {
    const mods: RelModule[] = [
      {
        name: "A",
        symbols: [],
        texts: [{ addr: 0x100, bytes: [0xC3, 0x00, 0x00] }],
        refs: [{ addr: 0x101, sym: "MISSING" }],
        externs: ["MISSING"],
        entry: 0x100,
      },
    ];

    const result = linkModules(mods);
    const data = result.segments[0].data!;
    expect(data[1]).toBe(0x00);
    expect(data[2]).toBe(0x00);
  });
});
