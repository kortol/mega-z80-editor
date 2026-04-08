// src/linker/output/__tests__/binAdapter.test.ts
import fs from "fs";
import path from "path";
import os from "os";
import { BinOutputAdapter } from "../binAdapter";
import { LinkResult } from "../../core/types";
import { randomUUID } from "crypto";

describe("P1-F: BinOutputAdapter", () => {
  const tmpDir = path.join(os.tmpdir(), "mz80-tests-" + randomUUID());
  const absPath = path.join(tmpDir, "TEST.ABS");
  const comPath = path.join(tmpDir, "TEST.COM");
  const comDmpPath = path.join(tmpDir, "TEST.COM.dmp");

  function safeUnlink(p: string) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  function safeRmdir(p: string) {
    try { fs.rmdirSync(p); } catch { /* ignore */ }
  }

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(absPath)) {
      safeUnlink(absPath);
    }
    if (fs.existsSync(comPath)) {
      safeUnlink(comPath);
    }
    if (fs.existsSync(comDmpPath)) {
      safeUnlink(comDmpPath);
    }
    // 一時ディレクトリも削除
    safeRmdir(tmpDir);
  })

  it("writes binary segment data correctly", () => {
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
    expect(bin.length).toBe(3);
    expect(Array.from(bin)).toEqual([0x3e, 0x00, 0xc9]);
  });

  it("writes .com binary and .com.dmp text dump", () => {
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
    adapter.write(comPath);

    const com = fs.readFileSync(comPath);
    expect(Array.from(com)).toEqual([0x3e, 0x00, 0xc9]);

    const dmp = fs.readFileSync(comDmpPath, "utf8");
    expect(dmp).toBe("0100: 3E 00 C9");
  });

  it("throws if segment is missing", () => {
    const result: LinkResult = { symbols: new Map(), segments: [], entry: 0x0 };
    const adapter = new BinOutputAdapter(result);
    expect(() => adapter.write(absPath)).toThrow(/No segments/);
  });
});
