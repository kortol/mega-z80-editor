import { Z80DebugCore } from "../core";
import { Z80DebugSession } from "../debugSession";

describe("Z80DebugSession", () => {
  test("exec breakpoint stop is structured during run", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.from([0x00, 0x00, 0x00]), 0x0100);
    core.setEntry(0x0100);
    const session = new Z80DebugSession(core);
    const bp = session.addBreakpoint({ kind: "exec", addr: 0x0101, enabled: true });
    const res = session.run(10);
    expect(res.stop.kind).toBe("breakpoint");
    expect((res.stop as any).breakpointId).toBe(bp.id);
    expect((res.stop as any).address).toBe(0x0101);
  });

  test("continue resumes past the current breakpoint", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.from([0x00, 0x00, 0x00]), 0x0100);
    core.setEntry(0x0100);
    const session = new Z80DebugSession(core);
    session.addBreakpoint({ kind: "exec", addr: 0x0100, enabled: true });
    session.addBreakpoint({ kind: "exec", addr: 0x0102, enabled: true });

    const res = session.run(10);
    expect(res.stop.kind).toBe("breakpoint");
    expect((res.stop as any).address).toBe(0x0102);
  });

  test("step resumes past the current breakpoint", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.from([0x00, 0x00, 0x00]), 0x0100);
    core.setEntry(0x0100);
    const session = new Z80DebugSession(core);
    session.addBreakpoint({ kind: "exec", addr: 0x0100, enabled: true });

    const res = session.stepInstruction(1);
    expect(res.stop.kind).toBe("step");
    expect(session.getRegisters().pc).toBe(0x0101);
  });

  test("logical call stack tracks call and return", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.from([0xcd, 0x04, 0x01, 0x00, 0x00, 0xc9]), 0x0100);
    core.setEntry(0x0100);
    const session = new Z80DebugSession(core);

    const intoCall = session.stepInstruction(1);
    expect(intoCall.stop.kind).toBe("step");
    expect(session.getRegisters().pc).toBe(0x0104);
    expect(session.getCallStack()).toEqual([
      { callSite: 0x0100, entry: 0x0104, returnAddr: 0x0103, kind: "CALL" },
    ]);

    const inCallee = session.stepInstruction(1);
    expect(inCallee.stop.kind).toBe("step");
    expect(session.getRegisters().pc).toBe(0x0105);
    expect(session.getCallStack()).toHaveLength(1);

    const outOfCall = session.stepInstruction(1);
    expect(outOfCall.stop.kind).toBe("step");
    expect(session.getRegisters().pc).toBe(0x0103);
    expect(session.getCallStack()).toEqual([]);
  });

  test("register and memory read/write", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.alloc(16, 0), 0x0100);
    core.setEntry(0x0100);
    const session = new Z80DebugSession(core);

    session.setRegisters({ a: 0x12, pc: 0x0200, sp: 0xeff0 });
    const regs = session.getRegisters();
    expect(regs.a).toBe(0x12);
    expect(regs.pc).toBe(0x0200);
    expect(regs.sp).toBe(0xeff0);

    session.writeMemory(0x2000, [0xaa, 0xbb, 0xcc]);
    expect(session.readMemory(0x2000, 3)).toEqual([0xaa, 0xbb, 0xcc]);
  });

  test("queueConsoleInput appends CR when requested", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.alloc(1, 0), 0x0100);
    core.setEntry(0x0100);
    const session = new Z80DebugSession(core);

    expect(session.queueConsoleInput("LIST", true)).toBe(5);
    expect(core.createSnapshot().inputQueue).toEqual([
      0x4c, 0x49, 0x53, 0x54, 0x0d,
    ]);
  });

  test("resolveAddress and resolveLocation with source map entries", () => {
    const core = new Z80DebugCore(false);
    core.loadImage(Buffer.from([0x00, 0x00, 0x00, 0x00]), 0x0100);
    core.setEntry(0x0100);
    const session = new Z80DebugSession(core, [
      { addr: 0x0100, size: 2, file: "src/main.asm", line: 10, column: 3, module: "MAIN", section: "TEXT" },
      { addr: 0x0102, size: 2, file: "src/main.asm", line: 11, column: 1, module: "MAIN", section: "TEXT" },
    ]);

    expect(session.resolveAddress(0x0101)).toMatchObject({
      addr: 0x0101,
      file: "src/main.asm",
      line: 10,
      column: 3,
    });
    expect(session.resolveAddress(0x0200)).toBeNull();

    expect(session.resolveLocation({ file: "src/main.asm", line: 10 })).toEqual([0x0100]);
    expect(session.resolveLocation({ file: "src\\main.asm", line: 11 })).toEqual([0x0102]);
    expect(session.resolveLocation({ file: "src/main.asm", line: 11, column: 1 })).toEqual([0x0102]);
    expect(session.resolveLocation({ file: "src/main.asm", line: 11, column: 9 })).toEqual([]);
    expect(session.resolveLocation({ file: "C:\\repo\\src\\main.asm", line: 10 })).toEqual([0x0100]);
    expect(session.resolveLocation({ file: "/repo/src/main.asm", line: 11 })).toEqual([0x0102]);
  });
});
