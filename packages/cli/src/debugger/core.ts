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
};

export type StepResult = {
  stopped: boolean;
  reason?: string;
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
  private imageStart = 0x0100;
  private imageEnd = 0x0100;
  state: CpuState = {
    a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, f: 0,
    sp: 0xfffe, pc: 0x0100,
  };
  private dmaAddr = 0x0080;

  constructor(private readonly trace = false) { }

  loadImage(image: Buffer, base: number): void {
    this.mem.fill(0);
    // CP/M conventional low-memory stubs.
    this.mem[0x0000] = 0xc3; // JP 0000 (warm boot loop sentinel)
    this.mem[0x0001] = 0x00;
    this.mem[0x0002] = 0x00;
    // CALL 0005h vector: JP F000h (typical CP/M style).
    this.mem[0x0005] = 0xc3;
    this.mem[0x0006] = 0x00;
    this.mem[0x0007] = 0xf0;
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
  }

  setEntry(entry: number): void {
    this.state.pc = entry & 0xffff;
  }

  getOutput(): string {
    return this.out.join("");
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

  private setZ(isZero: boolean): void {
    this.state.f = isZero ? (this.state.f | 0x40) : (this.state.f & ~0x40);
  }

  private setSZ(value: number): void {
    const v = value & 0xff;
    this.setZ(v === 0);
    if (v & 0x80) this.state.f |= 0x80;
    else this.state.f &= ~0x80;
  }

  private bdosCall(): string | undefined {
    const fn = this.state.c & 0xff;
    switch (fn) {
      case 0:
        return "BDOS 0: terminate";
      case 2:
        this.out.push(String.fromCharCode(this.state.e & 0xff));
        this.state.a = this.state.e & 0xff;
        return undefined;
      case 9: {
        let p = ((this.state.d & 0xff) << 8) | (this.state.e & 0xff);
        let guard = 0;
        while (guard++ < 0x10000) {
          const ch = this.read8(p++);
          if (ch === 0x24) break;
          this.out.push(String.fromCharCode(ch));
        }
        this.state.a = 0;
        return undefined;
      }
      case 6: {
        // Direct console I/O. For E=FF, return input status/char.
        // For now emulate "no key pressed".
        this.state.a = 0x00;
        return undefined;
      }
      case 11:
        // Console status: 0=no char.
        this.state.a = 0x00;
        return undefined;
      case 12:
        // Return CP/M version (roughly 2.2).
        this.state.a = 0x22;
        return undefined;
      case 26: {
        // Set DMA address from DE.
        this.dmaAddr = ((this.state.d & 0xff) << 8) | (this.state.e & 0xff);
        this.state.a = 0x00;
        return undefined;
      }
      default:
        // Keep deterministic behavior for unimplemented BDOS calls.
        this.state.a = 0x00;
        return undefined;
    }
  }

  step(): StepResult {
    const cpu = this.state;

    if (cpu.pc === 0x0000) {
      const suffix = this.lastExec ? ` after ${this.lastExec}` : "";
      return { stopped: true, reason: `PC reached 0000H (warm boot)${suffix}` };
    }
    if (this.breakpoints.has(cpu.pc)) {
      return { stopped: true, reason: `Breakpoint hit at ${formatHex(cpu.pc)}H` };
    }
    const inImage = cpu.pc >= this.imageStart && cpu.pc < this.imageEnd;
    const inCpmVector = cpu.pc === 0x0000 || cpu.pc === 0x0005;
    if (!inImage && !inCpmVector) {
      const suffix = this.lastExec ? ` after ${this.lastExec}` : "";
      return {
        stopped: true,
        reason: `PC out of image range at ${formatHex(cpu.pc)}H (image=${formatHex(this.imageStart)}H-${formatHex((this.imageEnd - 1) & 0xffff)}H)${suffix}`,
      };
    }
    const op = this.read8(cpu.pc);
    this.lastExec = `${formatHex(cpu.pc)}:${formatHex(op, 2)}H`;
    if (this.trace) {
      console.log(
        `PC=${formatHex(cpu.pc)} OP=${formatHex(op, 2)} A=${formatHex(cpu.a, 2)} BC=${formatHex((cpu.b << 8) | cpu.c)} DE=${formatHex((cpu.d << 8) | cpu.e)} HL=${formatHex((cpu.h << 8) | cpu.l)} SP=${formatHex(cpu.sp)}`
      );
    }
    this.steps++;

    switch (op) {
      case 0x00: cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x76: return { stopped: true, reason: "HALT" };
      case 0x3e: cpu.a = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x06: cpu.b = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x0e: cpu.c = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x16: cpu.d = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x1e: cpu.e = this.read8(cpu.pc + 1); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x36: this.write8((cpu.h << 8) | cpu.l, this.read8(cpu.pc + 1)); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0x2c: cpu.l = (cpu.l + 1) & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0x23: {
        const hl = ((cpu.h << 8) | cpu.l) + 1;
        cpu.h = (hl >> 8) & 0xff; cpu.l = hl & 0xff; cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
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
      case 0xaf: cpu.a = 0; this.setSZ(cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xb7: this.setSZ(cpu.a); cpu.pc = (cpu.pc + 1) & 0xffff; break;
      case 0xe6: cpu.a = cpu.a & this.read8(cpu.pc + 1); this.setSZ(cpu.a); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0xf6: cpu.a = cpu.a | this.read8(cpu.pc + 1); this.setSZ(cpu.a); cpu.pc = (cpu.pc + 2) & 0xffff; break;
      case 0xb9: {
        const r = (cpu.a - cpu.c) & 0xff;
        this.setSZ(r);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x80: {
        cpu.a = (cpu.a + cpu.b) & 0xff;
        this.setSZ(cpu.a);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x32: this.write8(this.read16(cpu.pc + 1), cpu.a); cpu.pc = (cpu.pc + 3) & 0xffff; break;
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
      case 0xeb: {
        const d = cpu.d; const e = cpu.e;
        cpu.d = cpu.h; cpu.e = cpu.l; cpu.h = d; cpu.l = e;
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x18: {
        const e = this.read8(cpu.pc + 1);
        const d = (e & 0x80) ? e - 0x100 : e;
        cpu.pc = (cpu.pc + 2 + d) & 0xffff;
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
      case 0xcd: {
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        if (nn === 0x0005) {
          const stop = this.bdosCall();
          cpu.pc = ret;
          if (stop) return { stopped: true, reason: stop };
          break;
        }
        this.push16(ret);
        cpu.pc = nn;
        break;
      }
      case 0xcc: { // CALL Z,nn
        const nn = this.read16(cpu.pc + 1);
        const ret = (cpu.pc + 3) & 0xffff;
        const z = (cpu.f & 0x40) !== 0;
        if (z) {
          this.push16(ret);
          cpu.pc = nn;
        } else {
          cpu.pc = ret;
        }
        break;
      }
      case 0xc9:
        cpu.pc = this.pop16();
        break;
      case 0xf0: { // RET P
        const s = (cpu.f & 0x80) !== 0;
        if (!s) cpu.pc = this.pop16();
        else cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0x35: { // DEC (HL)
        const addr = (cpu.h << 8) | cpu.l;
        const v = (this.read8(addr) - 1) & 0xff;
        this.write8(addr, v);
        this.setSZ(v);
        cpu.pc = (cpu.pc + 1) & 0xffff;
        break;
      }
      case 0xc7: // RST 0
        this.push16((cpu.pc + 1) & 0xffff);
        cpu.pc = 0x0000;
        return { stopped: true, reason: "RST 0 (warm boot)" };
      case 0xcb: { // bit ops (partial)
        const op2 = this.read8(cpu.pc + 1);
        if (op2 === 0xbe) { // RES 7,(HL)
          const addr = (cpu.h << 8) | cpu.l;
          this.write8(addr, this.read8(addr) & 0x7f);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        return { stopped: true, reason: `Unsupported opcode CB ${formatHex(op2, 2)}H at ${formatHex(cpu.pc)}H` };
      }
      case 0xed: { // ED prefix (partial)
        const op2 = this.read8(cpu.pc + 1);
        if (op2 === 0xb0) { // LDIR
          let bc = ((cpu.b << 8) | cpu.c) & 0xffff;
          let hl = ((cpu.h << 8) | cpu.l) & 0xffff;
          let de = ((cpu.d << 8) | cpu.e) & 0xffff;
          while (bc > 0) {
            this.write8(de, this.read8(hl));
            hl = (hl + 1) & 0xffff;
            de = (de + 1) & 0xffff;
            bc = (bc - 1) & 0xffff;
          }
          cpu.b = (bc >> 8) & 0xff; cpu.c = bc & 0xff;
          cpu.h = (hl >> 8) & 0xff; cpu.l = hl & 0xff;
          cpu.d = (de >> 8) & 0xff; cpu.e = de & 0xff;
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
        if (op2 === 0x4b) { // LD BC,(nn)
          const nn = this.read16(cpu.pc + 2);
          cpu.c = this.read8(nn);
          cpu.b = this.read8((nn + 1) & 0xffff);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x7b) { // LD SP,(nn)
          const nn = this.read16(cpu.pc + 2);
          cpu.sp = this.read8(nn) | (this.read8((nn + 1) & 0xffff) << 8);
          cpu.pc = (cpu.pc + 4) & 0xffff;
          break;
        }
        if (op2 === 0x62) { // SBC HL,HL (used as clear)
          cpu.h = 0;
          cpu.l = 0;
          this.setSZ(0);
          cpu.pc = (cpu.pc + 2) & 0xffff;
          break;
        }
        return { stopped: true, reason: `Unsupported opcode ED ${formatHex(op2, 2)}H at ${formatHex(cpu.pc)}H` };
      }
      default:
        return { stopped: true, reason: `Unsupported opcode ${formatHex(op, 2)}H at ${formatHex(cpu.pc)}H` };
    }

    return { stopped: false };
  }

  run(maxSteps: number): StepResult {
    let left = maxSteps;
    while (left-- > 0) {
      const r = this.step();
      if (r.stopped) return r;
    }
    return { stopped: true, reason: `Step limit reached (${maxSteps})` };
  }
}
