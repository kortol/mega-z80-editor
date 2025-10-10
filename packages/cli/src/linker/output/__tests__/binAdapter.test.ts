// src/linker/output/__tests__/binAdapter.test.ts
import { BinOutputAdapter } from "../binAdapter";
import { LinkResult } from "../../core/types";

describe("P1-F: BinOutputAdapter", () => {
  it("writes segment data correctly", () => {
    const adapter = new BinOutputAdapter();
    const result: LinkResult = {
      symbols: new Map(),
      entry: 0x100,
      segments: [
        {
          bank: 0,
          kind: "text",
          range: { min: 0x100, max: 0x102 },
          data: new Uint8Array([0x3E, 0x00, 0xC9]),
        },
      ],
    };
    const bin = adapter.write(result);
    expect(bin).toBeInstanceOf(Uint8Array);
    expect(bin.length).toBe(3);
    expect(bin[2]).toBe(0xC9); // RET
  });

  it("throws if segment is missing", () => {
    const adapter = new BinOutputAdapter();
    const result: LinkResult = { symbols: new Map(), segments: [], entry: 0x0 };
    expect(() => adapter.write(result)).toThrow(/No segments/);
  });
});
