import * as fs from "fs";
import * as path from "path";
import { IOBus } from "../io/IOBus";

export type CpuState = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;
  f: number;
  sp: number;
  pc: number;
  ix: number;
  iy: number;
  i: number;
  r: number;
};

export type StepResult = {
  stopped: boolean;
  reason?: string;
  history?: string[];
};

export type RunProgress = {
  steps: number;
  executed: number;
  remaining: number;
};

export type RunOptions = {
  progressEvery?: number;
  onProgress?: (progress: RunProgress) => void;
};

export type CallFrame = {
  callSite: number;
  entry: number;
  returnAddr: number;
  kind: "CALL" | "RST";
};

export type CoreShadowState = {
  a: number;
  f: number;
  b: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;
};

export type Z80CoreSnapshot = {
  version: 1;
  memBase64: string;
  ioPortsBase64: string;
  state: CpuState;
  steps: number;
  lastExec: string;
  traceRing: string[];
  traceMax: number;
  imageStart: number;
  imageEnd: number;
  dmaAddr: number;
  cpmRoot: string;
  cpmInteractive: boolean;
  cpmBdosTrace: boolean;
  cpm22Enabled: boolean;
  cpm22Loaded: boolean;
  inputQueue: number[];
  deferredInputQueue: number[];
  stdinPreloaded: boolean;
  pipeInputArmed: boolean;
  lastOutChar: number;
  iff1: boolean;
  iff2: boolean;
  im: number;
  shadow: CoreShadowState;
  allowOutOfImage: boolean;
  biosTrack: number;
  biosSector: number;
  biosDma: number;
  callFrames?: CallFrame[];
  out: string;
};

export function parseNum(input: string): number {
  const s = input.trim();
  if (/^[0-9]+$/i.test(s)) return Number.parseInt(s, 10);
  if (/^[0-9a-f]+h$/i.test(s)) return Number.parseInt(s.slice(0, -1), 16);
  if (/^0x[0-9a-f]+$/i.test(s)) return Number.parseInt(s.slice(2), 16);
  throw new Error(`Invalid numeric value: ${input}`);
}

export function formatHex(value: number, width = 4): string {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

export class Z80DebugCore {
  readonly mem = new Uint8Array(0x10000);
  readonly breakpoints = new Set<number>();
  readonly out: string[] = [];
  steps = 0;
  private lastExec = "";
  private traceRing: string[] = [];
  private traceMax = 32;
  private imageStart = 0x0100;
  private imageEnd = 0x0100;
  state: CpuState = {
    a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, f: 0,
    sp: 0xfffe, pc: 0x0100,
    ix: 0x0000, iy: 0x0000,
    i: 0x00, r: 0x00,
  };
  private dmaAddr = 0x0080;
  private cpm: import("./cpm").CpmBdos | null = null;
  private cpmRoot = process.cwd();
  private cpmInteractive = false;
  private cpmBdosTrace = false;
  private cpm22Enabled = false;
  private cpm22Loaded = false;
  private inputQueue: number[] = [];
  private deferredInputQueue: number[] = [];
  private stdinPreloaded = false;
  private pipeInputArmed = false;
  private lastOutChar = 0x00;
  private iff1 = false;
  private iff2 = false;
  private im = 0;
  private shadow = { a: 0, f: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0 };
  private allowOutOfImage = false;
  private ioPorts = new Uint8Array(0x100);
  private ioBus: IOBus | null = null;
  private biosTrack = 0;
  private biosSector = 0;
  private biosDma = 0x0080;
  private callFrames: CallFrame[] = [];

  private static readonly CPM22_CBASE = 0xdc00;
  private static readonly CPM22_FBASE = 0xe406;
  private static readonly CPM22_BIOS = {
    BOOT: 0xf200,
    WBOOT: 0xf203,
    CONST: 0xf206,
    CONIN: 0xf209,
    CONOUT: 0xf20c,
    LIST: 0xf20f,
    PUNCH: 0xf212,
    READER: 0xf215,
    HOME: 0xf218,
    SELDSK: 0xf21b,
    SETTRK: 0xf21e,
    SETSEC: 0xf221,
    SETDMA: 0xf224,
    READ: 0xf227,
    WRITE: 0xf22a,
    PRSTAT: 0xf22d,
    SECTRN: 0xf230,
  } as const;

  constructor(private readonly trace = false) {
    const { CpmBdos } = require("./cpm");
    this.cpm = new CpmBdos({
      read8: (addr: number) => this.read8(addr),
      write8: (addr: number, value: number) => this.write8(addr, value),
      getDma: () => this.dmaAddr,
      setDma: (addr: number) => { this.dmaAddr = addr & 0xffff; },
      output: (text: string) => this.pushOutput(text),
      rootDir: this.cpmRoot,
      trace: this.cpmBdosTrace,
      interactive: () => this.cpmInteractive,
      readConsoleChar: (blocking: boolean) => this.readConsoleChar(blocking),
      hasConsoleChar: () => this.hasConsoleChar(),
      readConsoleLine: (maxLen: number) => this.readConsoleLine(maxLen),
    });
  }

  loadImage(image: Buffer, base: number): void {
    this.mem.fill(0);
    this.callFrames = [];
    // CP/M conventional low-memory stubs.
    this.mem[0x0000] = 0xc3; // JP 0000 (warm boot loop sentinel)
    this.mem[0x0001] = 0x00;
    this.mem[0x0002] = 0x00;
    // CALL 0005h vector defaults to legacy hook.
    this.mem[0x0005] = 0xc3;
    this.mem[0x0006] = 0x00;
    this.mem[0x0007] = 0xf0;
    // RST vectors (CP/M-ish shim): RST 20h commonly used as BDOS gateway.
    this.mem[0x0020] = 0xc3; // JP 0005h
    this.mem[0x0021] = 0x05;
    this.mem[0x0022] = 0x00;
    // Other vectors default to RET to avoid falling into zero-fill.
    for (const v of [0x08, 0x10, 0x18, 0x28, 0x30, 0x38]) {
      this.mem[v] = 0xc9;
    }
    // Default command tail at DMA area.
    this.mem[0x0080] = 0x00; // length
    this.mem[0x0081] = 0x0d; // CR
    this.dmaAddr = 0x0080;

    const start = Math.max(0, Math.min(0xffff, base));
    this.imageStart = start;
    this.imageEnd = Math.min(0x10000, start + image.length);
    for (let i = 0; i < image.length && start + i < this.mem.length; i++) {
      this.mem[start + i] = image[i];
    }
    this.cpm22Loaded = false;
    this.tryLoadCpm22Bdos();
  }

  setEntry(entry: number): void {
    this.state.pc = entry & 0xffff;
    this.callFrames = [];
  }

  getRegisters(): CpuState {
    return { ...this.state };
  }

  setRegisters(partial: Partial<CpuState>): void {
    const s = this.state;
    const set8 = (k: keyof CpuState) => {
      const v = partial[k];
      if (typeof v === "number") (s as any)[k] = v & 0xff;
    };
    const set16 = (k: keyof CpuState) => {
      const v = partial[k];
      if (typeof v === "number") (s as any)[k] = v & 0xffff;
    };
    set8("a"); set8("b"); set8("c"); set8("d"); set8("e"); set8("h"); set8("l"); set8("f");
    set8("i"); set8("r");
    set16("sp"); set16("pc"); set16("ix"); set16("iy");
  }

  readMemory(addr: number, len: number): number[] {
    const out: number[] = [];
    const n = Math.max(0, len | 0);
    let a = addr & 0xffff;
    for (let i = 0; i < n; i++) {
      out.push(this.read8(a));
      a = (a + 1) & 0xffff;
    }
    return out;
  }

  writeMemory(addr: number, data: ArrayLike<number>): void {
    let a = addr & 0xffff;
    for (let i = 0; i < data.length; i++) {
      this.write8(a, data[i] & 0xff);
      a = (a + 1) & 0xffff;
    }
  }

  readPort(port: number): number {
    return this.ioRead(port);
  }

  writePort(port: number, value: number): void {
    this.ioWrite(port, value);
  }

  getCallStack(): CallFrame[] {
    return this.callFrames.map((frame) => ({ ...frame }));
  }

  setCpmRoot(rootDir: string): void {
    this.cpmRoot = rootDir;
    this.cpm?.setRootDir(rootDir);
  }

  setIoBus(ioBus: IOBus | null): void {
    this.ioBus = ioBus;
  }

  setAllowOutOfImage(enabled: boolean): void {
    this.allowOutOfImage = enabled;
  }

  setCpmInteractive(enabled: boolean): void {
    this.cpmInteractive = enabled;
  }

  setCpmBdosTrace(enabled: boolean): void {
    this.cpmBdosTrace = enabled;
    this.cpm?.setTrace(enabled);
  }

  setCpm22Enabled(enabled: boolean): void {
    this.cpm22Enabled = enabled;
  }

  setCommandTail(tail: string): void {
    const raw = tail ?? "";
    const bytes = Buffer.from(raw, "ascii");
    const len = Math.min(127, bytes.length);
    this.mem[0x0080] = len & 0xff;
    for (let i = 0; i < len; i++) this.mem[0x0081 + i] = bytes[i] & 0x7f;
    this.mem[0x0081 + len] = 0x0d; // CP/M command tail terminator
    this.setDefaultFcbsFromTail(raw);
  }

  queueConsoleInput(text: string, appendCr = false): number {
    const raw = String(text ?? "");
    const bytes = Buffer.from(raw, "ascii");
    let prevWasCr = false;
    let queued = 0;
    for (let i = 0; i < bytes.length; i++) {
      const ch = bytes[i] & 0x7f;
      if (ch === 0x0a) {
        if (!prevWasCr) {
          this.inputQueue.push(0x0d);
          queued++;
        }
        prevWasCr = false;
        continue;
      }
      this.inputQueue.push(ch);
      queued++;
      prevWasCr = ch === 0x0d;
    }
    if (appendCr && !prevWasCr) {
      this.inputQueue.push(0x0d);
      queued++;
    }
    this.pipeInputArmed = true;
    return queued;
  }

  private setDefaultFcbsFromTail(tail: string): void {
    const tokens = tail
      .trim()
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    this.initFcb(0x005c);
    this.initFcb(0x006c);
    if (tokens.length > 0) this.fillFcbFromToken(0x005c, tokens[0]);
    if (tokens.length > 1) this.fillFcbFromToken(0x006c, tokens[1]);
  }

  private initFcb(addr: number): void {
    this.mem[addr] = 0x00; // default drive
    for (let i = 1; i <= 11; i++) this.mem[addr + i] = 0x20; // name/ext
    for (let i = 12; i < 36; i++) this.mem[addr + i] = 0x00;
  }

  private fillFcbFromToken(addr: number, token: string): void {
    let t = token.trim();
    const driveMatch = /^([A-Za-z]):(.*)$/.exec(t);
    if (driveMatch) {
      const drv = driveMatch[1].toUpperCase().charCodeAt(0) - "A".charCodeAt(0) + 1;
      this.mem[addr] = Math.max(0, Math.min(16, drv));
      t = driveMatch[2];
    }
    const parts = t.split(".", 2);
    const name = (parts[0] ?? "").toUpperCase();
    const ext = (parts[1] ?? "").toUpperCase();
    for (let i = 0; i < 8; i++) {
      const ch = name[i];
      this.mem[addr + 1 + i] = ch ? this.fcbChar(ch) : 0x20;
    }
    for (let i = 0; i < 3; i++) {
      const ch = ext[i];
      this.mem[addr + 9 + i] = ch ? this.fcbChar(ch) : 0x20;
    }
  }

  private fcbChar(ch: string): number {
    if (ch === "*" || ch === "?") return 0x3f;
    const c = ch.charCodeAt(0) & 0x7f;
    if (c < 0x20 || c > 0x7e) return 0x20;
    return c;
  }

  getOutput(): string {
    return this.out.join("");
  }

  createSnapshot(): Z80CoreSnapshot {
    return {
      version: 1,
      memBase64: Buffer.from(this.mem).toString("base64"),
      ioPortsBase64: Buffer.from(this.ioPorts).toString("base64"),
      state: { ...this.state },
      steps: this.steps,
      lastExec: this.lastExec,
      traceRing: [...this.traceRing],
      traceMax: this.traceMax,
      imageStart: this.imageStart,
      imageEnd: this.imageEnd,
      dmaAddr: this.dmaAddr,
      cpmRoot: this.cpmRoot,
      cpmInteractive: this.cpmInteractive,
      cpmBdosTrace: this.cpmBdosTrace,
      cpm22Enabled: this.cpm22Enabled,
      cpm22Loaded: this.cpm22Loaded,
      inputQueue: [...this.inputQueue],
      deferredInputQueue: [...this.deferredInputQueue],
      stdinPreloaded: this.stdinPreloaded,
      pipeInputArmed: this.pipeInputArmed,
      lastOutChar: this.lastOutChar,
      iff1: this.iff1,
      iff2: this.iff2,
      im: this.im,
      shadow: { ...this.shadow },
      allowOutOfImage: this.allowOutOfImage,
      biosTrack: this.biosTrack,
      biosSector: this.biosSector,
      biosDma: this.biosDma,
      callFrames: this.getCallStack(),
      out: this.getOutput(),
    };
  }

  restoreSnapshot(snapshot: Z80CoreSnapshot): void {
    if (!snapshot || snapshot.version !== 1) {
      throw new Error("Unsupported snapshot version");
    }
    const mem = Buffer.from(snapshot.memBase64, "base64");
    if (mem.length !== 0x10000) {
      throw new Error(`Invalid snapshot memory size: ${mem.length}`);
    }
    this.mem.set(mem);
    const io = Buffer.from(snapshot.ioPortsBase64 ?? "", "base64");
    if (io.length === 0x100) this.ioPorts.set(io);
    else this.ioPorts.fill(0);
    this.state = { ...snapshot.state };
    this.steps = snapshot.steps;
    this.lastExec = snapshot.lastExec ?? "";
    this.traceRing = [...(snapshot.traceRing ?? [])];
    this.traceMax = snapshot.traceMax ?? 32;
    this.imageStart = Math.max(0, Math.min(0xffff, snapshot.imageStart ?? 0x0100));
    this.imageEnd = Math.max(0, Math.min(0x10000, snapshot.imageEnd ?? (this.imageStart + 1)));
    this.dmaAddr = snapshot.dmaAddr & 0xffff;
    this.cpmRoot = snapshot.cpmRoot ?? process.cwd();
    this.cpmInteractive = !!snapshot.cpmInteractive;
    this.cpmBdosTrace = !!snapshot.cpmBdosTrace;
    this.cpm22Enabled = snapshot.cpm22Enabled ?? true;
    this.cpm22Loaded = !!snapshot.cpm22Loaded;
    this.inputQueue = [...(snapshot.inputQueue ?? [])].map((v) => v & 0xff);
    this.deferredInputQueue = [...(snapshot.deferredInputQueue ?? [])].map((v) => v & 0xff);
    this.stdinPreloaded = !!snapshot.stdinPreloaded;
    this.pipeInputArmed = !!snapshot.pipeInputArmed;
    this.lastOutChar = (snapshot.lastOutChar ?? 0) & 0xff;
    this.iff1 = !!snapshot.iff1;
    this.iff2 = !!snapshot.iff2;
    this.im = snapshot.im ?? 0;
    this.shadow = {
      a: snapshot.shadow?.a ?? 0,
      f: snapshot.shadow?.f ?? 0,
      b: snapshot.shadow?.b ?? 0,
      c: snapshot.shadow?.c ?? 0,
      d: snapshot.shadow?.d ?? 0,
      e: snapshot.shadow?.e ?? 0,
      h: snapshot.shadow?.h ?? 0,
      l: snapshot.shadow?.l ?? 0,
    };
    this.allowOutOfImage = !!snapshot.allowOutOfImage;
    this.biosTrack = snapshot.biosTrack ?? 0;
    this.biosSector = snapshot.biosSector ?? 0;
    this.biosDma = snapshot.biosDma ?? 0x0080;
    this.callFrames = [...(snapshot.callFrames ?? [])].map((frame) => ({
      callSite: frame.callSite & 0xffff,
      entry: frame.entry & 0xffff,
      returnAddr: frame.returnAddr & 0xffff,
      kind: frame.kind === "RST" ? "RST" : "CALL",
    }));
    this.out.length = 0;
    if (snapshot.out) this.out.push(snapshot.out);
    this.cpm?.setRootDir(this.cpmRoot);
    this.cpm?.setTrace(this.cpmBdosTrace);
  }

  private pushOutput(text: string): void {
    this.out.push(text);
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i) & 0xff;
      // Arm scripted/pipe input after the first BASIC-style prompt.
      if (ch === 0x3e /* '>' */ && (this.lastOutChar === 0x00 || this.lastOutChar === 0x0a || this.lastOutChar === 0x0d)) {
        this.pipeInputArmed = true;
        this.releaseNextDeferredLine();
      }
      this.lastOutChar = ch;
    }
  }

  private releaseNextDeferredLine(): void {
    if (this.deferredInputQueue.length === 0) return;
    while (this.deferredInputQueue.length > 0) {
      const ch = this.deferredInputQueue.shift()!;
      this.inputQueue.push(ch);
      if (ch === 0x0d) break;
    }
  }

  private readConsoleChar(blocking: boolean): number | undefined {
    if (this.inputQueue.length > 0) {
      return this.inputQueue.shift();
    }
    if (!process.stdin.isTTY) {
      this.preloadPipeInput();
      if (!this.pipeInputArmed && !blocking) return undefined;
      if (this.inputQueue.length > 0) return this.inputQueue.shift();
      if (blocking && this.deferredInputQueue.length > 0) return this.deferredInputQueue.shift();
      return blocking ? 0x0d : undefined;
    }
    if (!blocking) return undefined;
    const buf = Buffer.alloc(1);
    const n = fs.readSync(0, buf, 0, 1, null);
    if (n <= 0) return 0x0d;
    const ch = buf[0] & 0xff;
    return ch === 0x0a ? 0x0d : ch;
  }

  private hasConsoleChar(): boolean {
    if (this.inputQueue.length > 0) return true;
    if (!process.stdin.isTTY) {
      this.preloadPipeInput();
      return this.pipeInputArmed ? this.inputQueue.length > 0 : false;
    }
    return false;
  }

  private preloadPipeInput(): void {
    if (this.stdinPreloaded) return;
    this.stdinPreloaded = true;
    const buf = Buffer.alloc(4096);
    let prevWasCr = false;
    while (true) {
      const n = fs.readSync(0, buf, 0, buf.length, null);
      if (n <= 0) break;
      for (let i = 0; i < n; i++) {
        const ch = buf[i] & 0xff;
        if (ch === 0x0a) {
          if (!prevWasCr) this.deferredInputQueue.push(0x0d);
          prevWasCr = false;
          continue;
        }
        this.deferredInputQueue.push(ch);
        prevWasCr = ch === 0x0d;
      }
    }
    if (this.pipeInputArmed) this.releaseNextDeferredLine();
  }

  private readConsoleLine(maxLen: number): string {
    const chars: number[] = [];
    while (chars.length < Math.max(0, maxLen)) {
      const ch = this.readConsoleChar(true) ?? 0x0d;
      if (ch === 0x0d || ch === 0x0a) break;
      if (ch === 0x08 || ch === 0x7f) {
        if (chars.length > 0) chars.pop();
        continue;
      }
      if (ch >= 0x20 && ch <= 0x7e) chars.push(ch);
    }
    return Buffer.from(chars).toString("ascii");
  }

  private read8(addr: number): number {
    return this.mem[addr & 0xffff];
  }

  private read16(addr: number): number {
    return this.read8(addr) | (this.read8(addr + 1) << 8);
  }

  private write8(addr: number, value: number): void {
    this.mem[addr & 0xffff] = value & 0xff;
  }

  private push16(value: number): void {
    this.state.sp = (this.state.sp - 1) & 0xffff;
    this.write8(this.state.sp, (value >> 8) & 0xff);
    this.state.sp = (this.state.sp - 1) & 0xffff;
    this.write8(this.state.sp, value & 0xff);
  }

  private pop16(): number {
    const lo = this.read8(this.state.sp);
    this.state.sp = (this.state.sp + 1) & 0xffff;
    const hi = this.read8(this.state.sp);
    this.state.sp = (this.state.sp + 1) & 0xffff;
    return (lo | (hi << 8)) & 0xffff;
  }

  private pushCallFrame(callSite: number, entry: number, returnAddr: number, kind: "CALL" | "RST"): void {
    this.callFrames.push({
      callSite: callSite & 0xffff,
      entry: entry & 0xffff,
      returnAddr: returnAddr & 0xffff,
      kind,
    });
    if (this.callFrames.length > 256) {
      this.callFrames.shift();
    }
  }

  private popCallFrame(returnAddr: number): void {
    const ret = returnAddr & 0xffff;
    for (let i = this.callFrames.length - 1; i >= 0; i--) {
      if ((this.callFrames[i].returnAddr & 0xffff) !== ret) continue;
      this.callFrames.length = i;
      return;
    }
    this.callFrames = [];
  }

  private static readonly FLAG_S = 0x80;
  private static readonly FLAG_Z = 0x40;
  private static readonly FLAG_Y = 0x20;
  private static readonly FLAG_H = 0x10;
  private static readonly FLAG_X = 0x08;
  private static readonly FLAG_PV = 0x04;
  private static readonly FLAG_N = 0x02;
  private static readonly FLAG_C = 0x01;

  private parityEven(v: number): boolean {
    let x = v & 0xff;
    x ^= x >> 4;
    x &= 0x0f;
    return ((0x6996 >> x) & 1) === 0;
  }

  private packSZ(value: number): number {
    const v = value & 0xff;
    let f = 0;
    if (v & 0x80) f |= Z80DebugCore.FLAG_S;
    if (v === 0) f |= Z80DebugCore.FLAG_Z;
    f |= v & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X);
    return f;
  }

  private setZ(isZero: boolean): void {
    if (isZero) this.state.f |= Z80DebugCore.FLAG_Z;
    else this.state.f &= ~Z80DebugCore.FLAG_Z;
  }

  // Undocumented XY for block ops uses bit3 and bit1 of the internal tmp value.
  private packBlockXY(value: number): number {
    const v = value & 0xff;
    return (v & Z80DebugCore.FLAG_X) | ((v & 0x02) << 4);
  }

  // CPI/CPD family: compare A with (HL), then HL +/- 1 and BC - 1.
  // Carry is preserved, PV reflects BC!=0 after decrement.
  private blockCompareStep(dir: 1 | -1): boolean {
    const a = this.state.a & 0xff;
    const hl = ((this.state.h << 8) | this.state.l) & 0xffff;
    let bc = ((this.state.b << 8) | this.state.c) & 0xffff;
    const v = this.read8(hl) & 0xff;
    const r = (a - v) & 0xff;
    const carry = this.state.f & Z80DebugCore.FLAG_C;

    bc = (bc - 1) & 0xffff;
    const nextHl = (hl + dir) & 0xffff;
    this.state.b = (bc >> 8) & 0xff;
    this.state.c = bc & 0xff;
    this.state.h = (nextHl >> 8) & 0xff;
    this.state.l = nextHl & 0xff;

    let f = carry | Z80DebugCore.FLAG_N;
    if (r & 0x80) f |= Z80DebugCore.FLAG_S;
    if (r === 0) f |= Z80DebugCore.FLAG_Z;
    const halfBorrow = (a & 0x0f) < (v & 0x0f);
    if (halfBorrow) f |= Z80DebugCore.FLAG_H;
    if (bc !== 0) f |= Z80DebugCore.FLAG_PV;
    const r2 = (r - (halfBorrow ? 1 : 0)) & 0xff;
    f |= this.packBlockXY(r2);
    this.state.f = f;
    return r === 0;
  }

  private ioRead(port: number): number {
    if (this.ioBus) return this.ioBus.in(port & 0xffff) & 0xff;
    return this.ioPorts[port & 0xff] & 0xff;
  }

  private ioWrite(port: number, value: number): void {
    if (this.ioBus) {
      this.ioBus.out(port & 0xffff, value & 0xff);
      return;
    }
    this.ioPorts[port & 0xff] = value & 0xff;
  }

  private blockIoInStep(dir: 1 | -1): void {
    const bc = ((this.state.b << 8) | this.state.c) & 0xffff;
    const hl = ((this.state.h << 8) | this.state.l) & 0xffff;
    const v = this.ioRead(bc);
    this.write8(hl, v);
    const b = (this.state.b - 1) & 0xff;
    const nextHl = (hl + dir) & 0xffff;
    this.state.b = b;
    this.state.h = (nextHl >> 8) & 0xff;
    this.state.l = nextHl & 0xff;
    // Approximate documented behavior for loop control and sign/zero.
    let f = this.state.f & Z80DebugCore.FLAG_C;
    if (b === 0) f |= Z80DebugCore.FLAG_Z;
    if (b & 0x80) f |= Z80DebugCore.FLAG_S;
    f |= Z80DebugCore.FLAG_N;
    this.state.f = f;
  }

  private blockIoOutStep(dir: 1 | -1): void {
    const bc = ((this.state.b << 8) | this.state.c) & 0xffff;
    const hl = ((this.state.h << 8) | this.state.l) & 0xffff;
    const v = this.read8(hl);
    this.ioWrite(bc, v);
    const b = (this.state.b - 1) & 0xff;
    const nextHl = (hl + dir) & 0xffff;
    this.state.b = b;
    this.state.h = (nextHl >> 8) & 0xff;
    this.state.l = nextHl & 0xff;
    // Approximate documented behavior for loop control and sign/zero.
    let f = this.state.f & Z80DebugCore.FLAG_C;
    if (b === 0) f |= Z80DebugCore.FLAG_Z;
    if (b & 0x80) f |= Z80DebugCore.FLAG_S;
    f |= Z80DebugCore.FLAG_N;
    this.state.f = f;
  }

  private blockTransferStep(dir: 1 | -1): void {
    let bc = ((this.state.b << 8) | this.state.c) & 0xffff;
    let hl = ((this.state.h << 8) | this.state.l) & 0xffff;
    let de = ((this.state.d << 8) | this.state.e) & 0xffff;
    const copied = this.read8(hl);
    this.write8(de, copied);
    hl = (hl + dir) & 0xffff;
    de = (de + dir) & 0xffff;
    bc = (bc - 1) & 0xffff;
    this.state.b = (bc >> 8) & 0xff;
    this.state.c = bc & 0xff;
    this.state.h = (hl >> 8) & 0xff;
    this.state.l = hl & 0xff;
    this.state.d = (de >> 8) & 0xff;
    this.state.e = de & 0xff;
    const keep = this.state.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_C);
    const tmp = ((this.state.a & 0xff) + (copied & 0xff)) & 0xff;
    this.state.f = keep | (bc !== 0 ? Z80DebugCore.FLAG_PV : 0) | this.packBlockXY(tmp);
  }

  private negA(): void {
    const v = this.state.a & 0xff;
    const r = (-v) & 0xff;
    this.state.a = r;
    let f = Z80DebugCore.FLAG_N | (r & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X));
    if (r & 0x80) f |= Z80DebugCore.FLAG_S;
    if (r === 0) f |= Z80DebugCore.FLAG_Z;
    if ((v & 0x0f) !== 0) f |= Z80DebugCore.FLAG_H;
    if (v === 0x80) f |= Z80DebugCore.FLAG_PV;
    if (v !== 0x00) f |= Z80DebugCore.FLAG_C;
    this.state.f = f;
  }

  private rrd(): void {
    const hl = ((this.state.h << 8) | this.state.l) & 0xffff;
    const m = this.read8(hl);
    const a = this.state.a & 0xff;
    const newM = ((a & 0x0f) << 4) | ((m >> 4) & 0x0f);
    const newA = (a & 0xf0) | (m & 0x0f);
    this.write8(hl, newM);
    this.state.a = newA;
    let f = (this.state.f & Z80DebugCore.FLAG_C) | (newA & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X));
    if (newA & 0x80) f |= Z80DebugCore.FLAG_S;
    if (newA === 0) f |= Z80DebugCore.FLAG_Z;
    if (this.parityEven(newA)) f |= Z80DebugCore.FLAG_PV;
    this.state.f = f;
  }

  private rld(): void {
    const hl = ((this.state.h << 8) | this.state.l) & 0xffff;
    const m = this.read8(hl);
    const a = this.state.a & 0xff;
    const newM = ((m << 4) & 0xf0) | (a & 0x0f);
    const newA = (a & 0xf0) | ((m >> 4) & 0x0f);
    this.write8(hl, newM);
    this.state.a = newA;
    let f = (this.state.f & Z80DebugCore.FLAG_C) | (newA & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X));
    if (newA & 0x80) f |= Z80DebugCore.FLAG_S;
    if (newA === 0) f |= Z80DebugCore.FLAG_Z;
    if (this.parityEven(newA)) f |= Z80DebugCore.FLAG_PV;
    this.state.f = f;
  }

  private addA(value: number, carryIn = 0): void {
    const a = this.state.a & 0xff;
    const v = value & 0xff;
    const c = carryIn ? 1 : 0;
    const sum = a + v + c;
    const r = sum & 0xff;
    let f = this.packSZ(r);
    if (((a & 0x0f) + (v & 0x0f) + c) > 0x0f) f |= Z80DebugCore.FLAG_H;
    if ((~(a ^ v) & (a ^ r) & 0x80) !== 0) f |= Z80DebugCore.FLAG_PV;
    if (sum > 0xff) f |= Z80DebugCore.FLAG_C;
    this.state.a = r;
    this.state.f = f;
  }

  private subA(value: number, carryIn = 0): void {
    const a = this.state.a & 0xff;
    const v = value & 0xff;
    const c = carryIn ? 1 : 0;
    const diff = a - v - c;
    const r = diff & 0xff;
    let f = this.packSZ(r) | Z80DebugCore.FLAG_N;
    if (((a & 0x0f) - (v & 0x0f) - c) < 0) f |= Z80DebugCore.FLAG_H;
    if (((a ^ v) & (a ^ r) & 0x80) !== 0) f |= Z80DebugCore.FLAG_PV;
    if (diff < 0) f |= Z80DebugCore.FLAG_C;
    this.state.a = r;
    this.state.f = f;
  }

  private cpA(value: number): void {
    const a = this.state.a & 0xff;
    const v = value & 0xff;
    const diff = a - v;
    const r = diff & 0xff;
    let f = this.packSZ(r) | Z80DebugCore.FLAG_N;
    f = (f & ~(Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X)) | (v & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X));
    if ((a & 0x0f) < (v & 0x0f)) f |= Z80DebugCore.FLAG_H;
    if (((a ^ v) & (a ^ r) & 0x80) !== 0) f |= Z80DebugCore.FLAG_PV;
    if (diff < 0) f |= Z80DebugCore.FLAG_C;
    this.state.f = f;
  }

  private logicA(value: number, kind: "and" | "or" | "xor"): void {
    const a = this.state.a & 0xff;
    const v = value & 0xff;
    let r = 0;
    if (kind === "and") r = a & v;
    else if (kind === "or") r = a | v;
    else r = a ^ v;
    this.state.a = r & 0xff;
    let f = this.packSZ(this.state.a);
    if (kind === "and") f |= Z80DebugCore.FLAG_H;
    if (this.parityEven(this.state.a)) f |= Z80DebugCore.FLAG_PV;
    this.state.f = f;
  }

  private inc8(value: number): number {
    const old = value & 0xff;
    const r = (old + 1) & 0xff;
    let f = (this.state.f & Z80DebugCore.FLAG_C) | this.packSZ(r);
    if ((old & 0x0f) === 0x0f) f |= Z80DebugCore.FLAG_H;
    if (old === 0x7f) f |= Z80DebugCore.FLAG_PV;
    this.state.f = f;
    return r;
  }

  private dec8(value: number): number {
    const old = value & 0xff;
    const r = (old - 1) & 0xff;
    let f = (this.state.f & Z80DebugCore.FLAG_C) | this.packSZ(r) | Z80DebugCore.FLAG_N;
    if ((old & 0x0f) === 0x00) f |= Z80DebugCore.FLAG_H;
    if (old === 0x80) f |= Z80DebugCore.FLAG_PV;
    this.state.f = f;
    return r;
  }

  private setBitFlags(bit: number, value: number): void {
    const oldCarry = this.state.f & Z80DebugCore.FLAG_C;
    const mask = 1 << (bit & 7);
    const isZero = (value & mask) === 0;
    let f = oldCarry | Z80DebugCore.FLAG_H | (value & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X));
    if (isZero) f |= Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV;
    if ((bit & 7) === 7 && (value & 0x80) !== 0) f |= Z80DebugCore.FLAG_S;
    this.state.f = f;
  }

  private setShiftRotateFlags(result: number, carry: number): void {
    let f = this.packSZ(result);
    if (this.parityEven(result)) f |= Z80DebugCore.FLAG_PV;
    if (carry) f |= Z80DebugCore.FLAG_C;
    this.state.f = f;
  }

  private setLdAirFlags(value: number): void {
    const oldCarry = this.state.f & Z80DebugCore.FLAG_C;
    let f = oldCarry;
    const v = value & 0xff;
    if (v & 0x80) f |= Z80DebugCore.FLAG_S;
    if (v === 0) f |= Z80DebugCore.FLAG_Z;
    f |= v & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X);
    if (this.parityEven(v)) f |= Z80DebugCore.FLAG_PV;
    this.state.f = f;
  }

  private add16WithFlags(lhs: number, rhs: number): number {
    const a = lhs & 0xffff;
    const b = rhs & 0xffff;
    const sum = a + b;
    const res = sum & 0xffff;
    let f = this.state.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV);
    f |= ((res >> 8) & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X));
    if (((a & 0x0fff) + (b & 0x0fff)) > 0x0fff) f |= Z80DebugCore.FLAG_H;
    if (sum > 0xffff) f |= Z80DebugCore.FLAG_C;
    this.state.f = f;
    return res;
  }

  private getReg8(code: number): number {
    switch (code & 7) {
      case 0: return this.state.b & 0xff;
      case 1: return this.state.c & 0xff;
      case 2: return this.state.d & 0xff;
      case 3: return this.state.e & 0xff;
      case 4: return this.state.h & 0xff;
      case 5: return this.state.l & 0xff;
      case 6: return this.read8((this.state.h << 8) | this.state.l);
      case 7: return this.state.a & 0xff;
      default: return 0;
    }
  }

  private setReg8(code: number, value: number): void {
    const v = value & 0xff;
    switch (code & 7) {
      case 0: this.state.b = v; break;
      case 1: this.state.c = v; break;
      case 2: this.state.d = v; break;
      case 3: this.state.e = v; break;
      case 4: this.state.h = v; break;
      case 5: this.state.l = v; break;
      case 6: this.write8((this.state.h << 8) | this.state.l, v); break;
      case 7: this.state.a = v; break;
    }
  }

  private bdosCall(): string | undefined {
    const fn = this.state.c & 0xff;
    if (!this.cpm) {
      this.state.a = 0x00;
      return undefined;
    }
    const res = this.cpm.handle(fn, this.state);
    // CP/M convention: many callers expect AL as return byte, and CP/M 3
    // style error probing checks H==FFH after BDOS.
    // Many CP/M callers branch on flags immediately after CALL 0005H.
    // Normalize flags from A and avoid stale carry leaking from caller-side ALU ops.
    const a = this.state.a & 0xff;
    this.state.l = a;
    this.state.h = (a === 0xff) ? 0xff : 0x00;
    let f = 0;
    if (a & 0x80) f |= Z80DebugCore.FLAG_S;
    if (a === 0x00) f |= Z80DebugCore.FLAG_Z;
    if (a === 0xff) f |= Z80DebugCore.FLAG_C;
    this.state.f = f;
    return res;
  }

  private cpm22SupportsFn(fn: number): boolean {
    // Keep legacy host-file BDOS path for disk/file functions.
    return fn === 0 || fn === 1 || fn === 2 || fn === 6 || fn === 9 || fn === 10 || fn === 11 || fn === 12 || fn === 26;
  }

  private enterCpm22Bdos(): void {
    this.state.pc = Z80DebugCore.CPM22_FBASE;
  }

  private tryLoadCpm22Bdos(): void {
    if (!this.cpm22Enabled) return;
    const candidates = [
      path.resolve(process.cwd(), "../../examples/cpm2-asm/CPM22.bin"),
      path.resolve(process.cwd(), "examples/cpm2-asm/CPM22.bin"),
      path.resolve(process.cwd(), "CPM22.bin"),
    ];
    const binPath = candidates.find((p) => fs.existsSync(p));
    if (!binPath) return;
    const bin = fs.readFileSync(binPath);
    const base = Z80DebugCore.CPM22_CBASE;
    for (let i = 0; i < bin.length && base + i < this.mem.length; i++) {
      this.mem[base + i] = bin[i];
    }
    // Redirect BDOS entry vector to CPM22 FBASE.
    this.mem[0x0005] = 0xc3;
    this.mem[0x0006] = Z80DebugCore.CPM22_FBASE & 0xff;
    this.mem[0x0007] = (Z80DebugCore.CPM22_FBASE >> 8) & 0xff;
    this.cpm22Loaded = true;
  }

  private cpm22BiosTrap(addr: number): StepResult | null {
    if (!this.cpm22Loaded) return null;
    const cpu = this.state;
    const B = Z80DebugCore.CPM22_BIOS;
    const retFromBios = () => { cpu.pc = this.pop16(); };
    switch (addr & 0xffff) {
      case B.BOOT:
      case B.WBOOT:
        return this.stop("PC reached 0000H (warm boot)");
      case B.CONST: {
        cpu.a =
          (this.cpmInteractive && this.hasConsoleChar())
            ? 0xff
            : 0x00;
        retFromBios();
        return { stopped: false };
      }
      case B.CONIN: {
        cpu.a = this.readConsoleChar(true) ?? 0x0d;
        retFromBios();
        return { stopped: false };
      }
      case B.CONOUT:
      case B.LIST:
      case B.PUNCH: {
        this.pushOutput(String.fromCharCode(cpu.c & 0xff));
        retFromBios();
        return { stopped: false };
      }
      case B.READER:
        cpu.a = 0x1a;
        retFromBios();
        return { stopped: false };
      case B.HOME:
        this.biosTrack = 0;
        retFromBios();
        return { stopped: false };
      case B.SELDSK:
        cpu.h = 0x00;
        cpu.l = 0x00;
        retFromBios();
        return { stopped: false };
      case B.SETTRK:
        this.biosTrack = ((cpu.b << 8) | cpu.c) & 0xffff;
        retFromBios();
        return { stopped: false };
      case B.SETSEC:
        this.biosSector = ((cpu.b << 8) | cpu.c) & 0xffff;
        retFromBios();
        return { stopped: false };
      case B.SETDMA:
        this.biosDma = ((cpu.b << 8) | cpu.c) & 0xffff;
        retFromBios();
        return { stopped: false };
      case B.READ:
      case B.WRITE:
      case B.PRSTAT:
        cpu.a = 0x00;
        retFromBios();
        return { stopped: false };
      case B.SECTRN:
        cpu.h = cpu.b & 0xff;
        cpu.l = cpu.c & 0xff;
        retFromBios();
        return { stopped: false };
      default:
        return null;
    }
  }

  step(): StepResult {
    const cpu = this.state;

    const biosTrap = this.cpm22BiosTrap(cpu.pc);
    if (biosTrap) return biosTrap;

    if (cpu.pc === 0x0000) {
      const suffix = this.lastExec ? ` after ${this.lastExec}` : "";
      return this.stop(`PC reached 0000H (warm boot)${suffix}`);
    }
    if (cpu.pc === 0x0005) {
      const fn = cpu.c & 0xff;
      if (this.cpm22Loaded && this.cpm22SupportsFn(fn)) {
        this.enterCpm22Bdos();
      } else {
        const stop = this.bdosCall();
        cpu.pc = this.pop16();
        if (stop) return this.stop(stop);
      }
      return { stopped: false };
    }
    if (this.breakpoints.has(cpu.pc)) {
      return this.stop(`Breakpoint hit at ${formatHex(cpu.pc)}H`);
    }
    const inImage = cpu.pc >= this.imageStart && cpu.pc < this.imageEnd;
    const inCpmVector = cpu.pc >= 0x0000 && cpu.pc < 0x0100;
    if (!this.allowOutOfImage && !inImage && !inCpmVector) {
      const suffix = this.lastExec ? ` after ${this.lastExec}` : "";
      return this.stop(
        `PC out of image range at ${formatHex(cpu.pc)}H (image=${formatHex(this.imageStart)}H-${formatHex((this.imageEnd - 1) & 0xffff)}H)${suffix}`
      );
    }
    const op = this.read8(cpu.pc);
    this.lastExec = `${formatHex(cpu.pc)}:${formatHex(op, 2)}H`;
    this.pushTrace(this.lastExec);
    if (this.trace) {
      console.log(
        `PC=${formatHex(cpu.pc)} OP=${formatHex(op, 2)} A=${formatHex(cpu.a, 2)} BC=${formatHex((cpu.b << 8) | cpu.c)} DE=${formatHex((cpu.d << 8) | cpu.e)} HL=${formatHex((cpu.h << 8) | cpu.l)} SP=${formatHex(cpu.sp)}`
      );
    }
    this.steps++;
    cpu.r = (cpu.r + 1) & 0xff;

    // IX/IY prefix handling (partial)
    if (op === 0xdd || op === 0xfd) {
      const useIy = op === 0xfd;
      const op2 = this.read8(cpu.pc + 1);
      const base = useIy ? cpu.iy : cpu.ix;
      const readDisp = () => {
        const e = this.read8(cpu.pc + 2);
        return (e & 0x80) ? e - 0x100 : e;
      };
      const setIndex = (v: number) => { if (useIy) cpu.iy = v & 0xffff; else cpu.ix = v & 0xffff; };
      const getIndex = () => (useIy ? cpu.iy : cpu.ix);
      const getPrefReg8 = (code: number): number => {
        const idx = getIndex();
        switch (code & 7) {
          case 4: return (idx >> 8) & 0xff; // IXH/IYH
          case 5: return idx & 0xff; // IXL/IYL
          default: return this.getReg8(code);
        }
      };
      const setPrefReg8 = (code: number, value: number): void => {
        const v = value & 0xff;
        const idx = getIndex();
        switch (code & 7) {
          case 4: // IXH/IYH
            setIndex(((v << 8) | (idx & 0x00ff)) & 0xffff);
            return;
          case 5: // IXL/IYL
            setIndex(((idx & 0xff00) | v) & 0xffff);
            return;
          default:
            this.setReg8(code, v);
            return;
        }
      };

      switch (op2) {
        case 0xcb: { // DD/FD CB d op
          const disp = readDisp();
          const addr = (base + disp) & 0xffff;
          const op3 = this.read8(cpu.pc + 3);
          const r = op3 & 0x07;
          const y = (op3 >> 3) & 0x07;
          const grp = (op3 >> 6) & 0x03;
          const old = this.read8(addr);

          if (grp === 0x01) { // BIT y,(IX/IY+d)
            const oldCarry = cpu.f & Z80DebugCore.FLAG_C;
            const mask = 1 << (y & 7);
            const isZero = (old & mask) === 0;
            let f = oldCarry | Z80DebugCore.FLAG_H | (((addr >> 8) & 0xff) & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X));
            if (isZero) f |= Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV;
            if ((y & 7) === 7 && !isZero) f |= Z80DebugCore.FLAG_S;
            cpu.f = f;
            cpu.pc = (cpu.pc + 4) & 0xffff;
            return { stopped: false };
          }

          if (grp === 0x02 || grp === 0x03) {
            const value = grp === 0x02 ? (old & ~(1 << y)) : (old | (1 << y));
            this.write8(addr, value);
            if (r !== 0x06) this.setReg8(r, value);
            cpu.pc = (cpu.pc + 4) & 0xffff;
            return { stopped: false };
          }

          const oldCarry = (cpu.f & 0x01) ? 1 : 0;
          let result = old;
          let carry = 0;
          switch (y) {
            case 0x00: // RLC
              carry = (old >> 7) & 1;
              result = ((old << 1) | carry) & 0xff;
              break;
            case 0x01: // RRC
              carry = old & 1;
              result = ((old >> 1) | (carry << 7)) & 0xff;
              break;
            case 0x02: // RL
              carry = (old >> 7) & 1;
              result = ((old << 1) | oldCarry) & 0xff;
              break;
            case 0x03: // RR
              carry = old & 1;
              result = ((old >> 1) | (oldCarry << 7)) & 0xff;
              break;
            case 0x04: // SLA
              carry = (old >> 7) & 1;
              result = (old << 1) & 0xff;
              break;
            case 0x05: // SRA
              carry = old & 1;
              result = ((old >> 1) | (old & 0x80)) & 0xff;
              break;
            case 0x06: // SLL
              carry = (old >> 7) & 1;
              result = ((old << 1) | 1) & 0xff;
              break;
            case 0x07: // SRL
              carry = old & 1;
              result = (old >> 1) & 0xff;
              break;
          }
          this.write8(addr, result);
          if (r !== 0x06) this.setReg8(r, result);
          this.setShiftRotateFlags(result, carry);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          return { stopped: false };
        }
        case 0x21: { // LD IX/IY,nn
          const nn = this.read16(cpu.pc + 2);
          setIndex(nn);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          return { stopped: false };
        }
        case 0x22: { // LD (nn),IX/IY
          const nn = this.read16(cpu.pc + 2);
          const v = getIndex();
          this.write8(nn, v & 0xff);
          this.write8((nn + 1) & 0xffff, (v >> 8) & 0xff);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          return { stopped: false };
        }
        case 0x2a: { // LD IX/IY,(nn)
          const nn = this.read16(cpu.pc + 2);
          const v = this.read8(nn) | (this.read8((nn + 1) & 0xffff) << 8);
          setIndex(v);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          return { stopped: false };
        }
        case 0x36: { // LD (IX/IY+d),n
          const disp = readDisp();
          const n = this.read8(cpu.pc + 3);
          this.write8((base + disp) & 0xffff, n);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          return { stopped: false };
        }
        case 0x34: { // INC (IX/IY+d)
          const disp = readDisp();
          const addr = (base + disp) & 0xffff;
          const v = this.inc8(this.read8(addr));
          this.write8(addr, v);
          cpu.pc = (cpu.pc + 3) & 0xffff;
          return { stopped: false };
        }
        case 0x35: { // DEC (IX/IY+d)
          const disp = readDisp();
          const addr = (base + disp) & 0xffff;
          const v = this.dec8(this.read8(addr));
          this.write8(addr, v);
          cpu.pc = (cpu.pc + 3) & 0xffff;
          return { stopped: false };
        }
        case 0x7e: { // LD A,(IX/IY+d)
          const disp = readDisp();
          cpu.a = this.read8((base + disp) & 0xffff);
          cpu.pc = (cpu.pc + 3) & 0xffff;
          return { stopped: false };
        }
        case 0x77: { // LD (IX/IY+d),A
          const disp = readDisp();
          this.write8((base + disp) & 0xffff, cpu.a);
          cpu.pc = (cpu.pc + 3) & 0xffff;
          return { stopped: false };
        }
        case 0x23: { // INC IX/IY
          setIndex((getIndex() + 1) & 0xffff);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x09: { // ADD IX/IY,BC
          const rr = ((cpu.b << 8) | cpu.c) & 0xffff;
          setIndex(this.add16WithFlags(getIndex(), rr));
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x19: { // ADD IX/IY,DE
          const rr = ((cpu.d << 8) | cpu.e) & 0xffff;
          setIndex(this.add16WithFlags(getIndex(), rr));
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x29: { // ADD IX/IY,IX/IY
          const idx = getIndex();
          setIndex(this.add16WithFlags(idx, idx));
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x39: { // ADD IX/IY,SP
          setIndex(this.add16WithFlags(getIndex(), cpu.sp & 0xffff));
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x2b: { // DEC IX/IY
          setIndex((getIndex() - 1) & 0xffff);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x24: { // INC IXH/IYH
          setPrefReg8(4, this.inc8(getPrefReg8(4)));
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x25: { // DEC IXH/IYH
          setPrefReg8(4, this.dec8(getPrefReg8(4)));
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x26: { // LD IXH/IYH,n
          setPrefReg8(4, this.read8(cpu.pc + 2));
          cpu.pc = (cpu.pc + 3) & 0xffff;
          return { stopped: false };
        }
        case 0x2c: { // INC IXL/IYL
          setPrefReg8(5, this.inc8(getPrefReg8(5)));
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x2d: { // DEC IXL/IYL
          setPrefReg8(5, this.dec8(getPrefReg8(5)));
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0x2e: { // LD IXL/IYL,n
          setPrefReg8(5, this.read8(cpu.pc + 2));
          cpu.pc = (cpu.pc + 3) & 0xffff;
          return { stopped: false };
        }
        case 0xe5: { // PUSH IX/IY
          this.push16(getIndex());
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0xe1: { // POP IX/IY
          setIndex(this.pop16());
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        case 0xf9: { // LD SP,IX/IY
          cpu.sp = getIndex();
          cpu.pc = (cpu.pc + 2) & 0xffff;
          return { stopped: false };
        }
        default:
          if (op2 >= 0x40 && op2 <= 0x7f && op2 !== 0x76) { // LD r,r' with IXH/IXL or (IX/IY+d)
            const dst = (op2 >> 3) & 0x07;
            const src = op2 & 0x07;
            if (src === 0x06 || dst === 0x06) {
              const disp = readDisp();
              const addr = (base + disp) & 0xffff;
              // DD/FD d-displacement memory forms keep plain H/L semantics.
              // e.g. DD 66 d = LD H,(IX+d), DD 74 d = LD (IX+d),H
              if (src === 0x06) this.setReg8(dst, this.read8(addr));
              else this.write8(addr, this.getReg8(src));
              cpu.pc = (cpu.pc + 3) & 0xffff;
              return { stopped: false };
            }
            setPrefReg8(dst, getPrefReg8(src));
            cpu.pc = (cpu.pc + 2) & 0xffff;
            return { stopped: false };
          }
          if (op2 >= 0x80 && op2 <= 0xbf && (op2 & 0x07) !== 0x06) { // ALU A,r with IXH/IXL / IYH/IYL
            const v = getPrefReg8(op2 & 0x07);
            switch ((op2 >> 3) & 0x07) {
              case 0x00: this.addA(v); break; // ADD
              case 0x01: this.addA(v, (cpu.f & 0x01) ? 1 : 0); break; // ADC
              case 0x02: this.subA(v); break; // SUB
              case 0x03: this.subA(v, (cpu.f & 0x01) ? 1 : 0); break; // SBC
              case 0x04: this.logicA(v, "and"); break; // AND
              case 0x05: this.logicA(v, "xor"); break; // XOR
              case 0x06: this.logicA(v, "or"); break; // OR
              case 0x07: this.cpA(v); break; // CP
            }
            cpu.pc = (cpu.pc + 2) & 0xffff;
            return { stopped: false };
          }
          if ((op2 & 0xc7) === 0x86) { // ALU A,(IX/IY+d)
            const disp = readDisp();
            const v = this.read8((base + disp) & 0xffff);
            switch ((op2 >> 3) & 0x07) {
              case 0x00: this.addA(v); break; // ADD A,(idx+d)
              case 0x01: this.addA(v, (cpu.f & 0x01) ? 1 : 0); break; // ADC
              case 0x02: this.subA(v); break; // SUB
              case 0x03: this.subA(v, (cpu.f & 0x01) ? 1 : 0); break; // SBC
              case 0x04: this.logicA(v, "and"); break; // AND
              case 0x05: this.logicA(v, "xor"); break; // XOR
              case 0x06: this.logicA(v, "or"); break; // OR
              case 0x07: this.cpA(v); break; // CP
            }
            cpu.pc = (cpu.pc + 3) & 0xffff;
            return { stopped: false };
          }
          return this.stop(`Unsupported opcode ${formatHex(op, 2)}H ${formatHex(op2, 2)}H at ${formatHex(cpu.pc)}H`);
      }
    }

    // LD r,r' (except HALT)
    if (op >= 0x40 && op <= 0x7f && op !== 0x76) {
      const dst = (op >> 3) & 7;
      const src = op & 7;
      const v = this.getReg8(src);
      this.setReg8(dst, v);
      cpu.pc = (cpu.pc + 1) & 0xffff;
      return { stopped: false };
    }

    // ADC A,r
    if (op >= 0x88 && op <= 0x8f) {
      const src = op & 7;
      const c = (cpu.f & 0x01) ? 1 : 0;
      const v = this.getReg8(src);
      this.addA(v, c);
      cpu.pc = (cpu.pc + 1) & 0xffff;
      return { stopped: false };
    }

    // SBC A,r
    if (op >= 0x98 && op <= 0x9f) {
      const src = op & 7;
      const c = (cpu.f & 0x01) ? 1 : 0;
      const v = this.getReg8(src);
      this.subA(v, c);
      cpu.pc = (cpu.pc + 1) & 0xffff;
      return { stopped: false };
    }

    switch (op) {
      case 0x00: cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x08: { // EX AF,AF'
        const sa = this.shadow.a; this.shadow.a = cpu.a; cpu.a = sa;
        const sf = this.shadow.f; this.shadow.f = cpu.f; cpu.f = sf;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x07: { // RLCA
        const c = (cpu.a >> 7) & 1;
        cpu.a = ((cpu.a << 1) | c) & 0xff;
        cpu.f =
          (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) |
          (cpu.a & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X)) |
          (c ? Z80DebugCore.FLAG_C : 0);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x0f: { // RRCA
        const c = cpu.a & 1;
        cpu.a = ((cpu.a >> 1) | (c << 7)) & 0xff;
        cpu.f =
          (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) |
          (cpu.a & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X)) |
          (c ? Z80DebugCore.FLAG_C : 0);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x17: { // RLA
        const oldC = cpu.f & Z80DebugCore.FLAG_C;
        const newC = (cpu.a >> 7) & 1;
        cpu.a = ((cpu.a << 1) | oldC) & 0xff;
        cpu.f =
          (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) |
          (cpu.a & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X)) |
          (newC ? Z80DebugCore.FLAG_C : 0);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x1f: { // RRA
        const oldC = cpu.f & Z80DebugCore.FLAG_C;
        const newC = cpu.a & Z80DebugCore.FLAG_C;
        cpu.a = ((cpu.a >> 1) | (oldC << 7)) & 0xff;
        cpu.f =
          (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) |
          (cpu.a & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X)) |
          (newC ? Z80DebugCore.FLAG_C : 0);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x27: { // DAA
        let a = cpu.a & 0xff;
        const oldF = cpu.f & 0xff;
        let h = (oldF & Z80DebugCore.FLAG_H) !== 0;
        const n = (oldF & Z80DebugCore.FLAG_N) !== 0;
        let c = (oldF & Z80DebugCore.FLAG_C) !== 0;
        const low = a & 0x0f;
        if (n) {
          const hd = c || a > 0x99;
          if (h || low > 9) {
            if (low > 5) h = false;
            a = (a - 0x06) & 0xff;
          }
          if (hd) a = a - 0x160;
        } else {
          if (h || low > 9) {
            h = low > 9;
            a = a + 0x06;
          }
          if (c || ((a & 0x1f0) > 0x90)) a = a + 0x60;
        }
        c = c || (((a >> 8) & 1) !== 0);
        a &= 0xff;
        cpu.a = a;
        let f = 0;
        if (a & 0x80) f |= Z80DebugCore.FLAG_S;
        if (a === 0) f |= Z80DebugCore.FLAG_Z;
        f |= a & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X);
        if (this.parityEven(a)) f |= Z80DebugCore.FLAG_PV;
        if (n) f |= Z80DebugCore.FLAG_N;
        if (h) f |= Z80DebugCore.FLAG_H;
        if (c) f |= Z80DebugCore.FLAG_C;
        cpu.f = f;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x76: return this.stop("HALT");
      case 0x3e: cpu.a = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x01: {
        const nn = this.read16(cpu.pc + 1);
        cpu.b = (nn >> 8) & 0xff; cpu.c = nn & 0xff; cpu.pc = (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0x06: cpu.b = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x0e: cpu.c = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x16: cpu.d = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x1e: cpu.e = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x26: cpu.h = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x2e: cpu.l = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x0a: cpu.a = this.read8((cpu.b << 8) | cpu.c); cpu.pc = (cpu.pc + 1) & 0xffff; break; // LD A,(BC)
      case 0x1a: cpu.a = this.read8((cpu.d << 8) | cpu.e); cpu.pc = (cpu.pc + 1) & 0xffff; break; // LD A,(DE)
      case 0x02: this.write8((cpu.b << 8) | cpu.c, cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break; // LD (BC),A
      case 0x12: this.write8((cpu.d << 8) | cpu.e, cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break; // LD (DE),A
      case 0x04: cpu.b = this.inc8(cpu.b); cpu.pc = (cpu.pc + 1) & 0xffff; break; // INC B
      case 0x05: cpu.b = this.dec8(cpu.b); cpu.pc = (cpu.pc + 1) & 0xffff; break; // DEC B
      case 0x0c: cpu.c = this.inc8(cpu.c); cpu.pc = (cpu.pc + 1) & 0xffff; break; // INC C
      case 0x0d: cpu.c = this.dec8(cpu.c); cpu.pc = (cpu.pc + 1) & 0xffff; break; // DEC C
      case 0x14: cpu.d = this.inc8(cpu.d); cpu.pc = (cpu.pc + 1) & 0xffff; break; // INC D
      case 0x15: cpu.d = this.dec8(cpu.d); cpu.pc = (cpu.pc + 1) & 0xffff; break; // DEC D
      case 0x1c: cpu.e = this.inc8(cpu.e); cpu.pc = (cpu.pc + 1) & 0xffff; break; // INC E
      case 0x1d: cpu.e = this.dec8(cpu.e); cpu.pc = (cpu.pc + 1) & 0xffff; break; // DEC E
      case 0x24: cpu.h = this.inc8(cpu.h); cpu.pc = (cpu.pc + 1) & 0xffff; break; // INC H
      case 0x25: cpu.h = this.dec8(cpu.h); cpu.pc = (cpu.pc + 1) & 0xffff; break; // DEC H
      case 0x2c: cpu.l = this.inc8(cpu.l); cpu.pc = (cpu.pc + 1) & 0xffff; break; // INC L
      case 0x2d: cpu.l = this.dec8(cpu.l); cpu.pc = (cpu.pc + 1) & 0xffff; break; // DEC L
      case 0x2f: // CPL
        cpu.a = (~cpu.a) & 0xff;
        cpu.f =
          (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV | Z80DebugCore.FLAG_C)) |
          (cpu.a & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X)) |
          Z80DebugCore.FLAG_H |
          Z80DebugCore.FLAG_N;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      case 0x3c: cpu.a = this.inc8(cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break; // INC A
      case 0x3d: cpu.a = this.dec8(cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break; // DEC A
      case 0x37: // SCF
        cpu.f =
          (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) |
          (cpu.a & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X)) |
          Z80DebugCore.FLAG_C;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      case 0x3f: { // CCF
        const oldC = cpu.f & Z80DebugCore.FLAG_C;
        cpu.f = (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) |
          (cpu.a & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X)) |
          (oldC ? Z80DebugCore.FLAG_H : 0) |
          (oldC ? 0 : Z80DebugCore.FLAG_C);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x36: this.write8((cpu.h << 8) | cpu.l, this.read8(cpu.pc + 1)); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x23: {
        const hl = ((cpu.h << 8) | cpu.l) + 1;
        cpu.h = (hl >> 8) & 0xff; cpu.l = hl & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x03: {
        const bc = ((cpu.b << 8) | cpu.c) + 1;
        cpu.b = (bc >> 8) & 0xff; cpu.c = bc & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x13: {
        const de = ((cpu.d << 8) | cpu.e) + 1;
        cpu.d = (de >> 8) & 0xff; cpu.e = de & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x33: cpu.sp = (cpu.sp + 1) & 0xffff; cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x0b: {
        const bc = ((cpu.b << 8) | cpu.c) - 1;
        cpu.b = (bc >> 8) & 0xff; cpu.c = bc & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x1b: {
        const de = ((cpu.d << 8) | cpu.e) - 1;
        cpu.d = (de >> 8) & 0xff; cpu.e = de & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x2b: {
        const hl = ((cpu.h << 8) | cpu.l) - 1;
        cpu.h = (hl >> 8) & 0xff; cpu.l = hl & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x3b: cpu.sp = (cpu.sp - 1) & 0xffff; cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x4e: cpu.c = this.read8((cpu.h << 8) | cpu.l); cpu.pc = (cpu.pc + 1) & 0xffff; break; // LD C,(HL)
      case 0x77: this.write8((cpu.h << 8) | cpu.l, cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x7e: cpu.a = this.read8((cpu.h << 8) | cpu.l); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x5f: cpu.e = cpu.a & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff; break; // LD E,A
      case 0x21: {
        const nn = this.read16(cpu.pc + 1);
        cpu.h = (nn >> 8) & 0xff; cpu.l = nn & 0xff; cpu.pc = (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0x11: {
        const nn = this.read16(cpu.pc + 1);
        cpu.d = (nn >> 8) & 0xff; cpu.e = nn & 0xff; cpu.pc = (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0x31: cpu.sp = this.read16(cpu.pc + 1); cpu.pc = (cpu.pc + 3) & 0xffff; break;
      case 0xf9: cpu.sp = ((cpu.h << 8) | cpu.l) & 0xffff; cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xaf: this.logicA(cpu.a, "xor"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xa8: this.logicA(cpu.b, "xor"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xa9: this.logicA(cpu.c, "xor"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xaa: this.logicA(cpu.d, "xor"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xab: this.logicA(cpu.e, "xor"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xac: this.logicA(cpu.h, "xor"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xad: this.logicA(cpu.l, "xor"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xae: this.logicA(this.read8((cpu.h << 8) | cpu.l), "xor"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb7: this.logicA(cpu.a, "or"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xe6: this.logicA(this.read8(cpu.pc + 1), "and"); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0xf6: this.logicA(this.read8(cpu.pc + 1), "or"); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0xde: { // SBC A,n (carry handling simplified)
        const n = this.read8(cpu.pc + 1);
        const c = (cpu.f & 0x01) ? 1 : 0;
        this.subA(n, c);
        cpu.pc = (cpu.pc + 2) & 0xffff;
        break;
      }
      case 0xee: this.logicA(this.read8(cpu.pc + 1), "xor"); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0xfe: {
        this.cpA(this.read8(cpu.pc + 1));
        cpu.pc = (cpu.pc + 2) & 0xffff;
        break;
      }
      case 0xb9: this.cpA(cpu.c); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb8: this.cpA(cpu.b); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xba: this.cpA(cpu.d); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xbb: this.cpA(cpu.e); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xbc: this.cpA(cpu.h); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xbd: this.cpA(cpu.l); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xbe: this.cpA(this.read8((cpu.h << 8) | cpu.l)); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xbf: this.cpA(cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x80: this.addA(cpu.b); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x81: this.addA(cpu.c); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x82: this.addA(cpu.d); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x83: this.addA(cpu.e); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x84: this.addA(cpu.h); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x85: this.addA(cpu.l); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x86: this.addA(this.read8((cpu.h << 8) | cpu.l)); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x87: this.addA(cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xc6: this.addA(this.read8(cpu.pc + 1)); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0xce: {
        const n = this.read8(cpu.pc + 1);
        const c = (cpu.f & 0x01) ? 1 : 0;
        this.addA(n, c);
        cpu.pc = (cpu.pc + 2) & 0xffff;
        break;
      }
      case 0x32: this.write8(this.read16(cpu.pc + 1), cpu.a); cpu.pc = (cpu.pc + 3) & 0xffff; break;
      case 0x3a: cpu.a = this.read8(this.read16(cpu.pc + 1)); cpu.pc = (cpu.pc + 3) & 0xffff; break; // LD A,(nn)
      case 0x22: {
        const nn = this.read16(cpu.pc + 1);
        this.write8(nn, cpu.l); this.write8(nn + 1, cpu.h); cpu.pc = (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0x2a: {
        const nn = this.read16(cpu.pc + 1);
        cpu.l = this.read8(nn); cpu.h = this.read8(nn + 1); cpu.pc = (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0xc3: cpu.pc = this.read16(cpu.pc + 1); break;
      case 0xc2: { // JP NZ,nn
        const nn = this.read16(cpu.pc + 1);
        const z = (cpu.f & 0x40) !== 0;
        cpu.pc = !z ? nn : (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0xca: { // JP Z,nn
        const nn = this.read16(cpu.pc + 1);
        const z = (cpu.f & 0x40) !== 0;
        cpu.pc = z ? nn : (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0xd2: { // JP NC,nn
        const nn = this.read16(cpu.pc + 1);
        const c = (cpu.f & 0x01) !== 0;
        cpu.pc = !c ? nn : (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0xda: { // JP C,nn
        const nn = this.read16(cpu.pc + 1);
        const c = (cpu.f & 0x01) !== 0;
        cpu.pc = c ? nn : (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0xe2: { // JP PO,nn
        const nn = this.read16(cpu.pc + 1);
        const pv = (cpu.f & 0x04) !== 0;
        cpu.pc = !pv ? nn : (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0xea: { // JP PE,nn
        const nn = this.read16(cpu.pc + 1);
        const pv = (cpu.f & 0x04) !== 0;
        cpu.pc = pv ? nn : (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0xf2: { // JP P,nn
        const nn = this.read16(cpu.pc + 1);
        const s = (cpu.f & 0x80) !== 0;
        cpu.pc = !s ? nn : (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0xfa: { // JP M,nn
        const nn = this.read16(cpu.pc + 1);
        const s = (cpu.f & 0x80) !== 0;
        cpu.pc = s ? nn : (cpu.pc + 3) & 0xffff;
        break;
      }
      case 0xeb: {
        const d = cpu.d; const e = cpu.e;
        cpu.d = cpu.h; cpu.e = cpu.l; cpu.h = d; cpu.l = e;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0xe9: // JP (HL)
        cpu.pc = ((cpu.h << 8) | cpu.l) & 0xffff;
        break;
      case 0xe3: { // EX (SP),HL
        const lo = this.read8(cpu.sp);
        const hi = this.read8((cpu.sp + 1) & 0xffff);
        this.write8(cpu.sp, cpu.l);
        this.write8((cpu.sp + 1) & 0xffff, cpu.h);
        cpu.h = hi; cpu.l = lo;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x18: {
        const e = this.read8(cpu.pc + 1);
        const d = (e & 0x80) ? e - 0x100 : e;
        cpu.pc = (cpu.pc + 2 + d) & 0xffff;
        break;
      }
      case 0x30: {
        const e = this.read8(cpu.pc + 1);
        const d = (e & 0x80) ? e - 0x100 : e;
        const c = (cpu.f & 0x01) !== 0;
        cpu.pc = c ? (cpu.pc + 2) & 0xffff : (cpu.pc + 2 + d) & 0xffff;
        break;
      }
      case 0x38: {
        const e = this.read8(cpu.pc + 1);
        const d = (e & 0x80) ? e - 0x100 : e;
        const c = (cpu.f & 0x01) !== 0;
        cpu.pc = c ? (cpu.pc + 2 + d) & 0xffff : (cpu.pc + 2) & 0xffff;
        break;
      }
      case 0x10: { // DJNZ e
        const e = this.read8(cpu.pc + 1);
        const d = (e & 0x80) ? e - 0x100 : e;
        cpu.b = (cpu.b - 1) & 0xff;
        cpu.pc = cpu.b !== 0 ? (cpu.pc + 2 + d) & 0xffff : (cpu.pc + 2) & 0xffff;
        break;
      }
      case 0x20: {
        const e = this.read8(cpu.pc + 1);
        const d = (e & 0x80) ? e - 0x100 : e;
        const z = (cpu.f & 0x40) !== 0;
        cpu.pc = z ? (cpu.pc + 2) & 0xffff : (cpu.pc + 2 + d) & 0xffff;
        break;
      }
      case 0x28: {
        const e = this.read8(cpu.pc + 1);
        const d = (e & 0x80) ? e - 0x100 : e;
        const z = (cpu.f & 0x40) !== 0;
        cpu.pc = z ? (cpu.pc + 2 + d) & 0xffff : (cpu.pc + 2) & 0xffff;
        break;
      }
      case 0xc0: { // RET NZ
        const z = (cpu.f & 0x40) !== 0;
        if (!z) {
          const ret = this.pop16();
          this.popCallFrame(ret);
          cpu.pc = ret;
        } else {
          cpu.pc = (cpu.pc + 1) & 0xffff;
        }
        break;
      }
      case 0xc8: { // RET Z
        const z = (cpu.f & 0x40) !== 0;
        if (z) {
          const ret = this.pop16();
          this.popCallFrame(ret);
          cpu.pc = ret;
        } else {
          cpu.pc = (cpu.pc + 1) & 0xffff;
        }
        break;
      }
      case 0xd0: { // RET NC
        const c = (cpu.f & 0x01) !== 0;
        if (!c) {
          const ret = this.pop16();
          this.popCallFrame(ret);
          cpu.pc = ret;
        } else {
          cpu.pc = (cpu.pc + 1) & 0xffff;
        }
        break;
      }
      case 0xd8: { // RET C
        const c = (cpu.f & 0x01) !== 0;
        if (c) {
          const ret = this.pop16();
          this.popCallFrame(ret);
          cpu.pc = ret;
        } else {
          cpu.pc = (cpu.pc + 1) & 0xffff;
        }
        break;
      }
      case 0xcd: {
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        if (nn === 0x0005) {
          const fn = cpu.c & 0xff;
          if (this.cpm22Loaded && this.cpm22SupportsFn(fn)) {
            this.push16(ret);
            this.pushCallFrame(cpu.pc, Z80DebugCore.CPM22_CBASE, ret, "CALL");
            this.enterCpm22Bdos();
          } else {
            const stop = this.bdosCall();
            cpu.pc = ret;
            if (stop) return { stopped: true, reason: stop };
          }
          break;
        }
        this.push16(ret);
        this.pushCallFrame(cpu.pc, nn, ret, "CALL");
        cpu.pc = nn;
        break;
      }
      case 0xc4: { // CALL NZ,nn
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        const z = (cpu.f & 0x40) !== 0;
        if (!z) {
          this.push16(ret);
          this.pushCallFrame(cpu.pc, nn, ret, "CALL");
          cpu.pc = nn;
        } else {
          cpu.pc = ret;
        }
        break;
      }
      case 0xcc: { // CALL Z,nn
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        const z = (cpu.f & 0x40) !== 0;
        if (z) {
          this.push16(ret);
          this.pushCallFrame(cpu.pc, nn, ret, "CALL");
          cpu.pc = nn;
        } else {
          cpu.pc = ret;
        }
        break;
      }
      case 0xd4: { // CALL NC,nn
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        const c = (cpu.f & 0x01) !== 0;
        if (!c) {
          this.push16(ret);
          this.pushCallFrame(cpu.pc, nn, ret, "CALL");
          cpu.pc = nn;
        } else {
          cpu.pc = ret;
        }
        break;
      }
      case 0xdc: { // CALL C,nn
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        const c = (cpu.f & 0x01) !== 0;
        if (c) {
          this.push16(ret);
          this.pushCallFrame(cpu.pc, nn, ret, "CALL");
          cpu.pc = nn;
        } else {
          cpu.pc = ret;
        }
        break;
      }
      case 0xe4: { // CALL PO,nn
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        const pv = (cpu.f & 0x04) !== 0;
        if (!pv) {
          this.push16(ret);
          this.pushCallFrame(cpu.pc, nn, ret, "CALL");
          cpu.pc = nn;
        } else {
          cpu.pc = ret;
        }
        break;
      }
      case 0xec: { // CALL PE,nn
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        const pv = (cpu.f & 0x04) !== 0;
        if (pv) {
          this.push16(ret);
          this.pushCallFrame(cpu.pc, nn, ret, "CALL");
          cpu.pc = nn;
        } else {
          cpu.pc = ret;
        }
        break;
      }
      case 0xf4: { // CALL P,nn
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        const s = (cpu.f & 0x80) !== 0;
        if (!s) {
          this.push16(ret);
          this.pushCallFrame(cpu.pc, nn, ret, "CALL");
          cpu.pc = nn;
        } else {
          cpu.pc = ret;
        }
        break;
      }
      case 0xfc: { // CALL M,nn
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        const s = (cpu.f & 0x80) !== 0;
        if (s) {
          this.push16(ret);
          this.pushCallFrame(cpu.pc, nn, ret, "CALL");
          cpu.pc = nn;
        } else {
          cpu.pc = ret;
        }
        break;
      }
      case 0xc9: {
        const ret = this.pop16();
        this.popCallFrame(ret);
        cpu.pc = ret;
        break;
      }
      case 0xc5: this.push16((cpu.b << 8) | cpu.c); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xd5: this.push16((cpu.d << 8) | cpu.e); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xe5: this.push16((cpu.h << 8) | cpu.l); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xf5: this.push16((cpu.a << 8) | cpu.f); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xc1: { const v = this.pop16(); cpu.b = (v >> 8) & 0xff; cpu.c = v & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff; break; }
      case 0xd1: { const v = this.pop16(); cpu.d = (v >> 8) & 0xff; cpu.e = v & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff; break; }
      case 0xe1: { const v = this.pop16(); cpu.h = (v >> 8) & 0xff; cpu.l = v & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff; break; }
      case 0xf1: { const v = this.pop16(); cpu.a = (v >> 8) & 0xff; cpu.f = v & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff; break; }
      case 0x09: { // ADD HL,BC
        const hl = this.add16WithFlags((cpu.h << 8) | cpu.l, (cpu.b << 8) | cpu.c);
        cpu.h = (hl >> 8) & 0xff; cpu.l = hl & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x19: { // ADD HL,DE
        const hl = this.add16WithFlags((cpu.h << 8) | cpu.l, (cpu.d << 8) | cpu.e);
        cpu.h = (hl >> 8) & 0xff; cpu.l = hl & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x29: { // ADD HL,HL
        const cur = (cpu.h << 8) | cpu.l;
        const hl = this.add16WithFlags(cur, cur);
        cpu.h = (hl >> 8) & 0xff; cpu.l = hl & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x39: { // ADD HL,SP
        const hl = this.add16WithFlags((cpu.h << 8) | cpu.l, cpu.sp);
        cpu.h = (hl >> 8) & 0xff; cpu.l = hl & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x90: this.subA(cpu.b); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x91: this.subA(cpu.c); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x92: this.subA(cpu.d); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x93: this.subA(cpu.e); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x94: this.subA(cpu.h); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x95: this.subA(cpu.l); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x96: this.subA(this.read8((cpu.h << 8) | cpu.l)); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x97: this.subA(cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xd6: this.subA(this.read8(cpu.pc + 1)); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0xd9: { // EXX
        const sb = this.shadow.b; this.shadow.b = cpu.b; cpu.b = sb;
        const sc = this.shadow.c; this.shadow.c = cpu.c; cpu.c = sc;
        const sd = this.shadow.d; this.shadow.d = cpu.d; cpu.d = sd;
        const se = this.shadow.e; this.shadow.e = cpu.e; cpu.e = se;
        const sh = this.shadow.h; this.shadow.h = cpu.h; cpu.h = sh;
        const sl = this.shadow.l; this.shadow.l = cpu.l; cpu.l = sl;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0xa0: this.logicA(cpu.b, "and"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xa1: this.logicA(cpu.c, "and"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xa2: this.logicA(cpu.d, "and"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xa3: this.logicA(cpu.e, "and"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xa4: this.logicA(cpu.h, "and"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xa5: this.logicA(cpu.l, "and"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xa6: this.logicA(this.read8((cpu.h << 8) | cpu.l), "and"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xa7: this.logicA(cpu.a, "and"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb0: this.logicA(cpu.b, "or"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb1: this.logicA(cpu.c, "or"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb2: this.logicA(cpu.d, "or"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb3: this.logicA(cpu.e, "or"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb4: this.logicA(cpu.h, "or"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb5: this.logicA(cpu.l, "or"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb6: this.logicA(this.read8((cpu.h << 8) | cpu.l), "or"); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xf0: { // RET P
        const s = (cpu.f & 0x80) !== 0;
        if (!s) {
          const ret = this.pop16();
          this.popCallFrame(ret);
          cpu.pc = ret;
        } else cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0xf8: { // RET M
        const s = (cpu.f & 0x80) !== 0;
        if (s) {
          const ret = this.pop16();
          this.popCallFrame(ret);
          cpu.pc = ret;
        } else cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x35: { // DEC (HL)
        const addr = (cpu.h << 8) | cpu.l;
        const v = this.dec8(this.read8(addr));
        this.write8(addr, v);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x34: { // INC (HL)
        const addr = (cpu.h << 8) | cpu.l;
        const v = this.inc8(this.read8(addr));
        this.write8(addr, v);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0xf3: // DI
        this.iff1 = false;
        this.iff2 = false;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      case 0xfb: // EI
        this.iff1 = true;
        this.iff2 = true;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      case 0xc7: // RST 0
      case 0xcf: // RST 8
      case 0xd7: // RST 10
      case 0xdf: // RST 18
      case 0xe7: // RST 20
      case 0xef: // RST 28
      case 0xf7: // RST 30
      case 0xff: { // RST 38
        const vec = op & 0x38;
        const ret = (cpu.pc + 1) & 0xffff;
        this.push16(ret);
        this.pushCallFrame(cpu.pc, vec, ret, "RST");
        cpu.pc = vec;
        if (vec === 0x00) {
          return { stopped: true, reason: "RST 0 (warm boot)" };
        }
        break;
      }
      case 0xcb: { // bit ops
        const op2 = this.read8(cpu.pc + 1);
        const r = op2 & 0x07;
        const y = (op2 >> 3) & 0x07;
        const grp = (op2 >> 6) & 0x03;
        const readR = (): number => this.getReg8(r) & 0xff;
        const writeR = (v: number): void => { this.setReg8(r, v & 0xff); };

        if (grp === 0x01) { // BIT y,r
          const v = readR();
          if (r === 0x06) {
            // BIT n,(HL): undocumented XY are cleared in this test reference model.
            const oldCarry = cpu.f & Z80DebugCore.FLAG_C;
            const mask = 1 << (y & 7);
            const isZero = (v & mask) === 0;
            let f = oldCarry | Z80DebugCore.FLAG_H;
            if (isZero) f |= Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV;
            if ((y & 7) === 7 && !isZero) f |= Z80DebugCore.FLAG_S;
            cpu.f = f;
          } else {
            this.setBitFlags(y, v);
          }
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }

        if (grp === 0x02) { // RES y,r
          const v = readR() & ~(1 << y);
          writeR(v);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }

        if (grp === 0x03) { // SET y,r
          const v = readR() | (1 << y);
          writeR(v);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }

        // grp === 0x00: rotate/shift
        const old = readR();
        const oldCarry = (cpu.f & 0x01) ? 1 : 0;
        let result = old;
        let carry = 0;
        switch (y) {
          case 0x00: // RLC
            carry = (old >> 7) & 1;
            result = ((old << 1) | carry) & 0xff;
            break;
          case 0x01: // RRC
            carry = old & 1;
            result = ((old >> 1) | (carry << 7)) & 0xff;
            break;
          case 0x02: // RL
            carry = (old >> 7) & 1;
            result = ((old << 1) | oldCarry) & 0xff;
            break;
          case 0x03: // RR
            carry = old & 1;
            result = ((old >> 1) | (oldCarry << 7)) & 0xff;
            break;
          case 0x04: // SLA
            carry = (old >> 7) & 1;
            result = (old << 1) & 0xff;
            break;
          case 0x05: // SRA
            carry = old & 1;
            result = ((old >> 1) | (old & 0x80)) & 0xff;
            break;
          case 0x06: // SLL (undocumented, used by some code)
            carry = (old >> 7) & 1;
            result = ((old << 1) | 1) & 0xff;
            break;
          case 0x07: // SRL
            carry = old & 1;
            result = (old >> 1) & 0xff;
            break;
          default:
            return this.stop(`Unsupported opcode CB ${formatHex(op2, 2)}H at ${formatHex(cpu.pc)}H`);
        }
        writeR(result);
        this.setShiftRotateFlags(result, carry);
        cpu.pc = (cpu.pc + 2) & 0xffff;
        break;
      }
      case 0xed: { // ED prefix (partial)
        const op2 = this.read8(cpu.pc + 1);
        if (op2 === 0x47) { // LD I,A
          cpu.i = cpu.a & 0xff;
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x4f) { // LD R,A
          cpu.r = cpu.a & 0xff;
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x57) { // LD A,I
          cpu.a = cpu.i & 0xff;
          this.setLdAirFlags(cpu.a);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x5f) { // LD A,R
          cpu.a = cpu.r & 0xff;
          this.setLdAirFlags(cpu.a);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x46 || op2 === 0x4e || op2 === 0x66 || op2 === 0x6e) { // IM 0
          this.im = 0;
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x56 || op2 === 0x76) { // IM 1
          this.im = 1;
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x5e || op2 === 0x7e) { // IM 2
          this.im = 2;
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x45 || op2 === 0x55 || op2 === 0x5d || op2 === 0x65 || op2 === 0x6d || op2 === 0x75 || op2 === 0x7d) { // RETN variants
          this.iff1 = this.iff2;
          const ret = this.pop16();
          this.popCallFrame(ret);
          cpu.pc = ret;
          break;
        }
        if (op2 === 0x4d) { // RETI
          const ret = this.pop16();
          this.popCallFrame(ret);
          cpu.pc = ret;
          break;
        }
        if (op2 === 0x44 || op2 === 0x4c || op2 === 0x54 || op2 === 0x5c || op2 === 0x64 || op2 === 0x6c || op2 === 0x74 || op2 === 0x7c) { // NEG variants
          this.negA();
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x67) { // RRD
          this.rrd();
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x6f) { // RLD
          this.rld();
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xa0) { // LDI
          this.blockTransferStep(1);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xa8) { // LDD
          this.blockTransferStep(-1);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xb0) { // LDIR
          while ((((cpu.b << 8) | cpu.c) & 0xffff) !== 0) {
            this.blockTransferStep(1);
          }
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xb8) { // LDDR
          while ((((cpu.b << 8) | cpu.c) & 0xffff) !== 0) {
            this.blockTransferStep(-1);
          }
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xb1) { // CPIR
          while ((((cpu.b << 8) | cpu.c) & 0xffff) !== 0) {
            const found = this.blockCompareStep(1);
            if (found) break;
          }
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xa1) { // CPI
          this.blockCompareStep(1);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xa9) { // CPD
          this.blockCompareStep(-1);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xb9) { // CPDR
          while ((((cpu.b << 8) | cpu.c) & 0xffff) !== 0) {
            const found = this.blockCompareStep(-1);
            if (found) break;
          }
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xa2) { // INI
          this.blockIoInStep(1);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xaa) { // IND
          this.blockIoInStep(-1);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xb2) { // INIR
          do {
            this.blockIoInStep(1);
          } while (cpu.b !== 0);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xba) { // INDR
          do {
            this.blockIoInStep(-1);
          } while (cpu.b !== 0);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xa3) { // OUTI
          this.blockIoOutStep(1);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xab) { // OUTD
          this.blockIoOutStep(-1);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xb3) { // OTIR
          do {
            this.blockIoOutStep(1);
          } while (cpu.b !== 0);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0xbb) { // OTDR
          do {
            this.blockIoOutStep(-1);
          } while (cpu.b !== 0);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x5b) { // LD DE,(nn)
          const nn = this.read16(cpu.pc + 2);
          cpu.e = this.read8(nn);
          cpu.d = this.read8((nn + 1) & 0xffff);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x53) { // LD (nn),DE
          const nn = this.read16(cpu.pc + 2);
          this.write8(nn, cpu.e);
          this.write8((nn + 1) & 0xffff, cpu.d);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x43) { // LD (nn),BC
          const nn = this.read16(cpu.pc + 2);
          this.write8(nn, cpu.c);
          this.write8((nn + 1) & 0xffff, cpu.b);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x63) { // LD (nn),HL
          const nn = this.read16(cpu.pc + 2);
          this.write8(nn, cpu.l);
          this.write8((nn + 1) & 0xffff, cpu.h);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x4b) { // LD BC,(nn)
          const nn = this.read16(cpu.pc + 2);
          cpu.c = this.read8(nn);
          cpu.b = this.read8((nn + 1) & 0xffff);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x6b) { // LD HL,(nn)
          const nn = this.read16(cpu.pc + 2);
          cpu.l = this.read8(nn);
          cpu.h = this.read8((nn + 1) & 0xffff);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x7b) { // LD SP,(nn)
          const nn = this.read16(cpu.pc + 2);
          cpu.sp = this.read8(nn) | (this.read8((nn + 1) & 0xffff) << 8);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x73) { // LD (nn),SP
          const nn = this.read16(cpu.pc + 2);
          this.write8(nn, cpu.sp & 0xff);
          this.write8((nn + 1) & 0xffff, (cpu.sp >> 8) & 0xff);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x42 || op2 === 0x52 || op2 === 0x62 || op2 === 0x72) { // SBC HL,rr
          const hl = ((cpu.h << 8) | cpu.l) & 0xffff;
          const carry = (cpu.f & 0x01) ? 1 : 0;
          const rr =
            op2 === 0x42 ? ((cpu.b << 8) | cpu.c) :
              op2 === 0x52 ? ((cpu.d << 8) | cpu.e) :
                op2 === 0x62 ? ((cpu.h << 8) | cpu.l) :
                  cpu.sp;
          const diff = hl - rr - carry;
          const res = diff & 0xffff;
          cpu.h = (res >> 8) & 0xff;
          cpu.l = res & 0xff;
          let f = 0;
          if (res & 0x8000) f |= Z80DebugCore.FLAG_S;
          if (res === 0) f |= Z80DebugCore.FLAG_Z;
          f |= ((res >> 8) & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X));
          if (((hl ^ rr ^ res) & 0x1000) !== 0) f |= Z80DebugCore.FLAG_H;
          if (((hl ^ rr) & (hl ^ res) & 0x8000) !== 0) f |= Z80DebugCore.FLAG_PV;
          f |= Z80DebugCore.FLAG_N;
          if (diff < 0) f |= Z80DebugCore.FLAG_C;
          cpu.f = f;
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        if (op2 === 0x4a || op2 === 0x5a || op2 === 0x6a || op2 === 0x7a) { // ADC HL,rr
          const hl = ((cpu.h << 8) | cpu.l) & 0xffff;
          const carry = (cpu.f & 0x01) ? 1 : 0;
          const rr =
            op2 === 0x4a ? ((cpu.b << 8) | cpu.c) :
              op2 === 0x5a ? ((cpu.d << 8) | cpu.e) :
                op2 === 0x6a ? ((cpu.h << 8) | cpu.l) :
                  cpu.sp;
          const sum = hl + rr + carry;
          const res = sum & 0xffff;
          cpu.h = (res >> 8) & 0xff;
          cpu.l = res & 0xff;
          let f = 0;
          if (res & 0x8000) f |= Z80DebugCore.FLAG_S;
          if (res === 0) f |= Z80DebugCore.FLAG_Z;
          f |= ((res >> 8) & (Z80DebugCore.FLAG_Y | Z80DebugCore.FLAG_X));
          if (((hl & 0x0fff) + (rr & 0x0fff) + carry) > 0x0fff) f |= Z80DebugCore.FLAG_H;
          if ((~(hl ^ rr) & (hl ^ res) & 0x8000) !== 0) f |= Z80DebugCore.FLAG_PV;
          if (sum > 0xffff) f |= Z80DebugCore.FLAG_C;
          cpu.f = f;
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        return this.stop(`Unsupported opcode ED ${formatHex(op2, 2)}H at ${formatHex(cpu.pc)}H`);
      }
      default:
        return this.stop(`Unsupported opcode ${formatHex(op, 2)}H at ${formatHex(cpu.pc)}H`);
    }

    return { stopped: false };
  }

  run(maxSteps: number, opts?: RunOptions): StepResult {
    const progressEvery = Math.max(0, Math.floor(opts?.progressEvery ?? 0));
    const onProgress = opts?.onProgress;
    const startSteps = this.steps;
    let nextProgress = progressEvery > 0 ? startSteps + progressEvery : Number.POSITIVE_INFINITY;
    let left = maxSteps;
    while (left-- > 0) {
      const r = this.step();
      if (r.stopped) return r;
      if (this.steps >= nextProgress) {
        onProgress?.({
          steps: this.steps,
          executed: this.steps - startSteps,
          remaining: left,
        });
        nextProgress += progressEvery;
      }
    }
    return this.stop(`Step limit reached (${maxSteps})`);
  }

  private pushTrace(entry: string) {
    this.traceRing.push(entry);
    if (this.traceRing.length > this.traceMax) {
      this.traceRing.shift();
    }
  }

  private getTraceTail(): string[] {
    return [...this.traceRing];
  }

  private stop(reason: string): StepResult {
    return { stopped: true, reason, history: this.getTraceTail() };
  }
}
