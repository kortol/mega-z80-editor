// src/linker/output/__tests__/binAdapter.test.ts
import fs from "fs";
import path from "path";
import { BinOutputAdapter } from "../binAdapter";
import { LinkResult } from "../../core/types";
import { randomUUID } from "crypto";

describe("P1-F: BinOutputAdapter", () => {
  const tmpDir = path.resolve(__dirname, "../../../.tmp_tests." + randomUUID());
  const absPath = path.join(tmpDir, "TEST.ABS");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
    // 一時ディレクトリも削除
    fs.rmdirSync(tmpDir);
  })

  it("writes segment data correctly", () => {
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
    const adapter = new BinOutputAdapter(result);
    adapter.write(absPath); // ✅ 出力ファイル指定

    const bin = fs.readFileSync(absPath);
    expect(bin).toBeInstanceOf(Uint8Array);
    expect(bin.length).toBe(14);
    // ファイルの内容は”0100 3E 00 C9”という文字列なのでそれを直接チェック
    expect(bin.toString()).toBe("0100: 3E 00 C9");
  });

  it("throws if segment is missing", () => {
    const result: LinkResult = { symbols: new Map(), segments: [], entry: 0x0 };
    const adapter = new BinOutputAdapter(result);
    expect(() => adapter.write(absPath)).toThrow(/No segments/);
  });
});
