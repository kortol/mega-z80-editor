import { SymAdapter } from "../symAdapter";
import { LinkResult } from "../../core/types";

describe("P1-F: SymAdapter", () => {
  it("outputs defined symbols correctly", () => {
    const result: LinkResult = {
      symbols: new Map([
        ["START", { bank: 0, addr: 0x0100 }],
        ["LOOP", { bank: 0, addr: 0x0120 }],
      ]),
      segments: [],
    };
    const adapter = new SymAdapter(result);
    const text = adapter["generateText"]();

    expect(text).toMatch(/SYMBOL TABLE/);
    expect(text).toMatch(/START\s+0100H/);
    expect(text).toMatch(/LOOP\s+0120H/);
  });

  it("marks undefined symbols", () => {
    const result: LinkResult = {
      symbols: new Map([["ZERO", { bank: 0, addr: undefined as any }]]),
      segments: [],
    };
    const adapter = new SymAdapter(result);
    const text = adapter["generateText"]();

    expect(text).toMatch(/ZERO\s+----H\s+\(UNDEF\)/);
  });

  it("sorts symbols alphabetically", () => {
    const result: LinkResult = {
      symbols: new Map([
        ["ZETA", { bank: 0, addr: 0x2000 }],
        ["ALPHA", { bank: 0, addr: 0x1000 }],
      ]),
      segments: [],
    };
    const adapter = new SymAdapter(result);
    const text = adapter["generateText"]();

    const alphaPos = text.indexOf("ALPHA");
    const zetaPos = text.indexOf("ZETA");
    expect(alphaPos).toBeLessThan(zetaPos);
  });
});
