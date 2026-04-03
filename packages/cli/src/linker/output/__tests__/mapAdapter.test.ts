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
      ["START", { bank: 0, addr: 0x0100 }],
      ["ZERO", { bank: 0, addr: 0x0000 }],
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
    expect(text).toMatch(/LINK MAP OF OUTPUT/);
    expect(text).toMatch(/@START/);
    expect(text).toMatch(/SEGMENTS:/);
    expect(text).toMatch(/ENTRY:/);
  });

  it("marks unresolved symbols with '?'", () => {
    const adapter = new MapAdapter(sample);
    const text = adapter.generateText();
    expect(text).toMatch(/\?UNRES/);
  });

  it("shows human-readable size in segments", () => {
    const text = new MapAdapter(sample).generateText();
    expect(text).toMatch(/size=0006H/);
    expect(text).toMatch(/\(6 bytes\)/);
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
