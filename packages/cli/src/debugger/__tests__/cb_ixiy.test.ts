import { Z80DebugCore } from "../core";
import { decodeOne } from "../disasm";

describe("debugger CB/DDCB support", () => {
  test("disasm: CB BIT", () => {
    const buf = new Uint8Array([0xcb, 0x56]);
    const d = decodeOne(buf, 0, 0x1000);
    expect(d.size).toBe(2);
    expect(d.text).toBe("BIT 2,(HL)");
  });

  test("disasm: DDCB form", () => {
    const buf = new Uint8Array([0xdd, 0xcb, 0xfe, 0x00]);
    const d = decodeOne(buf, 0, 0x2000);
    expect(d.size).toBe(4);
    expect(d.text).toBe("RLC (IX-02H),B");
  });

  test("core: CB BIT updates flags", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.from([0xcb, 0x56]), 0x0100);
    core.setEntry(0x0100);
    core.state.h = 0x20;
    core.state.l = 0x00;
    core.mem[0x2000] = 0x04; // bit2 set
    const r = core.step();
    expect(r.stopped).toBe(false);
    expect(core.state.pc).toBe(0x0102);
    expect((core.state.f & 0x40) !== 0).toBe(false); // Z=0
  });

  test("core: DDCB RES writes memory and register", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.from([0xdd, 0xcb, 0x01, 0x80]), 0x0100);
    core.setEntry(0x0100);
    core.state.ix = 0x3000;
    core.mem[0x3001] = 0xff;
    const r = core.step();
    expect(r.stopped).toBe(false);
    expect(core.state.pc).toBe(0x0104);
    expect(core.mem[0x3001]).toBe(0xfe);
    expect(core.state.b).toBe(0xfe);
  });
});

