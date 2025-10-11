import fs from "fs";
import path from "path";
import { MapAdapter } from "../mapAdapter";
import { LinkResult } from "../../core/types";

describe("P1-F: MapAdapter (BaseTextAdapter継承)", () => {
  const tmp = path.resolve(__dirname, "../../../.tmp_tests");
  const mapFile = path.join(tmp, "test.map");

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

  beforeAll(() => fs.mkdirSync(tmp, { recursive: true }));
  afterEach(() => fs.existsSync(mapFile) && fs.unlinkSync(mapFile));

  it("generates valid MAP output", () => {
    const adapter = new MapAdapter(sample);
    adapter.write(mapFile, false);

    const text = fs.readFileSync(mapFile, "utf-8");
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
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    new MapAdapter(sample).write(mapFile, true);
    const out = spy.mock.calls.map(c => c[0]).join("\n");
    expect(out).toMatch(/\[MAP\]/);
    expect(out).toMatch(/bytes/);
    spy.mockRestore();
  });
});
