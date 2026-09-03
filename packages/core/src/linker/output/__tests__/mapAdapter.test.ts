import fs from "fs";
import path from "path";
import os from "os";
import { MapAdapter } from "../mapAdapter";
import { LinkResult } from "../../core/types";
import { randomUUID } from "crypto";

describe("P1-F: MapAdapter (BaseTextAdapter継承)", () => {
  const tmpDir = path.join(os.tmpdir(), "mz80-tests-" + randomUUID());
  const mapPath = path.join(tmpDir, "test.map");

  const sample: LinkResult = {
    segments: [
      { bank: 0, kind: "text", range: { min: 0x0100, max: 0x0105 }, data: new Uint8Array(6) },
    ],
    entry: 0x0100,
    symbols: new Map([
      ["START", { bank: 0, addr: 0x0100, module: "MAIN", section: ".text", definedAt: "main.asm:10" }],
      ["ZERO", { bank: 0, addr: 0x0000, module: "MAIN", section: ".text", definedAt: "main.asm:1" }],
      ["UNRES", { bank: 0, addr: 0x0000 }], // 未解決扱い
    ]),
  };

  function safeUnlink(p: string) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  function safeRmdir(p: string) {
    try { fs.rmdirSync(p); } catch { /* ignore */ }
  }

  beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => fs.existsSync(mapPath) && safeUnlink(mapPath));
  afterAll(() => {
    if (fs.existsSync(mapPath)) {
      safeUnlink(mapPath);
    }
    // 一時ディレクトリも削除
    safeRmdir(tmpDir);
  })

  it("generates valid MAP output", () => {
    const adapter = new MapAdapter(sample);
    adapter.write(mapPath, false);

    const text = fs.readFileSync(mapPath, "utf-8");
    expect(text).toMatch(/START\s+= \$0100 ; addr, public/);
    expect(text).toMatch(/__head\s+= \$0100 ; const, public, def/);
    expect(text).toMatch(/__TEXT_size\s+= \$0006 ; const, public, def/);
    expect(text).toMatch(/__ENTRY\s+= \$0100 ; const, public, def/);
  });

  it("prints symbols as sjasm-like assignment lines", () => {
    const adapter = new MapAdapter(sample);
    const text = adapter.generateText();
    expect(text).toMatch(/UNRES\s+= \$0000 ; addr, public, , , ,/);
    expect(text).toMatch(/START\s+= \$0100 ; addr, public, , MAIN, \.text, main\.asm:10/);
  });

  it("shortens definedAt path from current directory", () => {
    const cwdPosix = process.cwd().replace(/\\/g, "/");
    const result: LinkResult = {
      segments: sample.segments,
      entry: sample.entry,
      symbols: new Map([
        ["P", { bank: 0, addr: 0x0100, module: "MAIN", section: ".text", definedAt: `${cwdPosix}/examples/a.asm:7` }],
      ]),
    };
    const text = new MapAdapter(result, { fullpath: "rel", cwd: process.cwd() }).generateText();
    expect(text).toMatch(/P\s+= \$0100 ; addr, public, , MAIN, \.text, examples\/a\.asm:7/);
  });

  it("shortens escaped windows fullpath", () => {
    const cwdWin = process.cwd().replace(/\//g, "\\");
    const escaped = `${cwdWin}\\examples\\b.asm:8`.replace(/\\/g, "\\\\");
    const result: LinkResult = {
      segments: sample.segments,
      entry: sample.entry,
      symbols: new Map([
        ["Q", { bank: 0, addr: 0x0101, module: "MAIN", section: ".text", definedAt: escaped }],
      ]),
    };
    const text = new MapAdapter(result, { fullpath: "rel", cwd: process.cwd() }).generateText();
    expect(text).toMatch(/Q\s+= \$0101 ; addr, public, , MAIN, \.text, examples\/b\.asm:8/);
  });

  it("rel mode keeps .. segments for paths outside cwd", () => {
    const cwd = process.cwd();
    const abs = path.resolve(cwd, "..", "..", "examples", "outside.asm").replace(/\\/g, "\\\\");
    const result: LinkResult = {
      segments: sample.segments,
      entry: sample.entry,
      symbols: new Map([
        ["U", { bank: 0, addr: 0x0101, module: "MAIN", section: ".text", definedAt: `${abs}:11` }],
      ]),
    };
    const text = new MapAdapter(result, { fullpath: "rel", cwd }).generateText();
    expect(text).toMatch(/U\s+= \$0101 ; addr, public, , MAIN, \.text, \.\.\/\.\.\/examples\/outside\.asm:11/);
  });

  it("off mode prints filename only", () => {
    const cwdWin = process.cwd().replace(/\//g, "\\");
    const escaped = `${cwdWin}\\dir\\c.asm:9`.replace(/\\/g, "\\\\");
    const result: LinkResult = {
      segments: sample.segments,
      entry: sample.entry,
      symbols: new Map([
        ["R", { bank: 0, addr: 0x0102, module: "MAIN", section: ".text", definedAt: escaped }],
      ]),
    };
    const text = new MapAdapter(result, { fullpath: "off" }).generateText();
    expect(text).toMatch(/R\s+= \$0102 ; addr, public, , MAIN, \.text, c\.asm:9/);
  });

  it("on mode prints absolute path", () => {
    const abs = path.join(process.cwd(), "dir", "d.asm").replace(/\\/g, "\\\\");
    const result: LinkResult = {
      segments: sample.segments,
      entry: sample.entry,
      symbols: new Map([
        ["S", { bank: 0, addr: 0x0103, module: "MAIN", section: ".text", definedAt: `${abs}:10` }],
      ]),
    };
    const text = new MapAdapter(result, { fullpath: "on", cwd: process.cwd() }).generateText();
    expect(text).toMatch(/S\s+= \$0103 ; addr, public, , MAIN, \.text, .*\/dir\/d\.asm:10/);
  });

  it("emits auto symbols for segment and whole image sizes", () => {
    const text = new MapAdapter(sample).generateText();
    expect(text).toMatch(/__size\s+= \$0006 ; const, public, def/);
    expect(text).toMatch(/__tail\s+= \$0106 ; const, public, def/);
  });

  it("prints verbose log with size", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => { });
    new MapAdapter(sample).write(mapPath, true);
    const out = spy.mock.calls.map(c => c[0]).join("\n");
    expect(out).toMatch(/\[MAP\]/);
    expect(out).toMatch(/bytes/);
    spy.mockRestore();
  });
});
