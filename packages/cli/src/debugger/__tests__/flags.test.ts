import { Z80DebugCore } from "../core";

describe("debugger flag semantics", () => {
  test("CP sets P/V on signed overflow (used by JP PE paths)", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.from([0xfe, 0x8a]), 0x0100); // CP 8AH
    core.setEntry(0x0100);
    core.state.a = 0x0d;

    const r = core.step();
    expect(r.stopped).toBe(false);
    expect(core.state.a).toBe(0x0d);
    expect((core.state.f & 0x04) !== 0).toBe(true); // P/V
    expect((core.state.f & 0x02) !== 0).toBe(true); // N
  });

  test("INC/DEC keep C and update H/N/PV", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.from([0x2c, 0x25]), 0x0100); // INC L / DEC H
    core.setEntry(0x0100);
    core.state.f = 0x01; // C=1
    core.state.l = 0x0f;
    core.state.h = 0x80;

    let r = core.step();
    expect(r.stopped).toBe(false);
    expect(core.state.l).toBe(0x10);
    expect((core.state.f & 0x01) !== 0).toBe(true); // C kept
    expect((core.state.f & 0x10) !== 0).toBe(true); // H
    expect((core.state.f & 0x02) !== 0).toBe(false); // N clear

    r = core.step();
    expect(r.stopped).toBe(false);
    expect(core.state.h).toBe(0x7f);
    expect((core.state.f & 0x01) !== 0).toBe(true); // C kept
    expect((core.state.f & 0x10) !== 0).toBe(true); // H
    expect((core.state.f & 0x04) !== 0).toBe(true); // P/V on 80->7F
    expect((core.state.f & 0x02) !== 0).toBe(true); // N
  });
});

