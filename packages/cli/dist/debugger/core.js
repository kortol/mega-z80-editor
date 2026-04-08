"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Z80DebugCore = void 0;
exports.parseNum = parseNum;
exports.formatHex = formatHex;
function parseNum(input) {
    const s = input.trim();
    if (/^[0-9]+$/i.test(s))
        return Number.parseInt(s, 10);
    if (/^[0-9a-f]+h$/i.test(s))
        return Number.parseInt(s.slice(0, -1), 16);
    if (/^0x[0-9a-f]+$/i.test(s))
        return Number.parseInt(s.slice(2), 16);
    throw new Error(`Invalid numeric value: ${input}`);
}
function formatHex(value, width = 4) {
    return value.toString(16).toUpperCase().padStart(width, "0");
}
class Z80DebugCore {
    trace;
    mem = new Uint8Array(0x10000);
    breakpoints = new Set();
    out = [];
    steps = 0;
    state = {
        a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, f: 0,
        sp: 0xfffe, pc: 0x0100,
    };
    constructor(trace = false) {
        this.trace = trace;
    }
    loadImage(image, base) {
        const start = Math.max(0, Math.min(0xffff, base));
        for (let i = 0; i < image.length && start + i < this.mem.length; i++) {
            this.mem[start + i] = image[i];
        }
    }
    setEntry(entry) {
        this.state.pc = entry & 0xffff;
    }
    getOutput() {
        return this.out.join("");
    }
    read8(addr) {
        return this.mem[addr & 0xffff];
    }
    read16(addr) {
        return this.read8(addr) | (this.read8(addr + 1) << 8);
    }
    write8(addr, value) {
        this.mem[addr & 0xffff] = value & 0xff;
    }
    push16(value) {
        this.state.sp = (this.state.sp - 1) & 0xffff;
        this.write8(this.state.sp, (value >> 8) & 0xff);
        this.state.sp = (this.state.sp - 1) & 0xffff;
        this.write8(this.state.sp, value & 0xff);
    }
    pop16() {
        const lo = this.read8(this.state.sp);
        this.state.sp = (this.state.sp + 1) & 0xffff;
        const hi = this.read8(this.state.sp);
        this.state.sp = (this.state.sp + 1) & 0xffff;
        return (lo | (hi << 8)) & 0xffff;
    }
    setZ(isZero) {
        this.state.f = isZero ? (this.state.f | 0x40) : (this.state.f & ~0x40);
    }
    bdosCall() {
        switch (this.state.c & 0xff) {
            case 0:
                return "BDOS 0: terminate";
            case 2:
                this.out.push(String.fromCharCode(this.state.e & 0xff));
                return undefined;
            case 9: {
                let p = ((this.state.d & 0xff) << 8) | (this.state.e & 0xff);
                let guard = 0;
                while (guard++ < 0x10000) {
                    const ch = this.read8(p++);
                    if (ch === 0x24)
                        break;
                    this.out.push(String.fromCharCode(ch));
                }
                return undefined;
            }
            default:
                return undefined;
        }
    }
    step() {
        const cpu = this.state;
        if (cpu.pc === 0x0000) {
            return { stopped: true, reason: "PC reached 0000H (warm boot)" };
        }
        if (this.breakpoints.has(cpu.pc)) {
            return { stopped: true, reason: `Breakpoint hit at ${formatHex(cpu.pc)}H` };
        }
        const op = this.read8(cpu.pc);
        if (this.trace) {
            console.log(`PC=${formatHex(cpu.pc)} OP=${formatHex(op, 2)} A=${formatHex(cpu.a, 2)} BC=${formatHex((cpu.b << 8) | cpu.c)} DE=${formatHex((cpu.d << 8) | cpu.e)} HL=${formatHex((cpu.h << 8) | cpu.l)} SP=${formatHex(cpu.sp)}`);
        }
        this.steps++;
        switch (op) {
            case 0x00:
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x76: return { stopped: true, reason: "HALT" };
            case 0x3e:
                cpu.a = this.read8(cpu.pc + 1);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x06:
                cpu.b = this.read8(cpu.pc + 1);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x0e:
                cpu.c = this.read8(cpu.pc + 1);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x16:
                cpu.d = this.read8(cpu.pc + 1);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x1e:
                cpu.e = this.read8(cpu.pc + 1);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x36:
                this.write8((cpu.h << 8) | cpu.l, this.read8(cpu.pc + 1));
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x2c:
                cpu.l = (cpu.l + 1) & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x23: {
                const hl = ((cpu.h << 8) | cpu.l) + 1;
                cpu.h = (hl >> 8) & 0xff;
                cpu.l = hl & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x77:
                this.write8((cpu.h << 8) | cpu.l, cpu.a);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x7e:
                cpu.a = this.read8((cpu.h << 8) | cpu.l);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x21: {
                const nn = this.read16(cpu.pc + 1);
                cpu.h = (nn >> 8) & 0xff;
                cpu.l = nn & 0xff;
                cpu.pc = (cpu.pc + 3) & 0xffff;
                break;
            }
            case 0x11: {
                const nn = this.read16(cpu.pc + 1);
                cpu.d = (nn >> 8) & 0xff;
                cpu.e = nn & 0xff;
                cpu.pc = (cpu.pc + 3) & 0xffff;
                break;
            }
            case 0x31:
                cpu.sp = this.read16(cpu.pc + 1);
                cpu.pc = (cpu.pc + 3) & 0xffff;
                break;
            case 0xf9:
                cpu.sp = ((cpu.h << 8) | cpu.l) & 0xffff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xaf:
                cpu.a = 0;
                this.setZ(true);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb7:
                this.setZ((cpu.a & 0xff) === 0);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xe6:
                cpu.a = cpu.a & this.read8(cpu.pc + 1);
                this.setZ((cpu.a & 0xff) === 0);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0xf6:
                cpu.a = cpu.a | this.read8(cpu.pc + 1);
                this.setZ((cpu.a & 0xff) === 0);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x32:
                this.write8(this.read16(cpu.pc + 1), cpu.a);
                cpu.pc = (cpu.pc + 3) & 0xffff;
                break;
            case 0x22: {
                const nn = this.read16(cpu.pc + 1);
                this.write8(nn, cpu.l);
                this.write8(nn + 1, cpu.h);
                cpu.pc = (cpu.pc + 3) & 0xffff;
                break;
            }
            case 0x2a: {
                const nn = this.read16(cpu.pc + 1);
                cpu.l = this.read8(nn);
                cpu.h = this.read8(nn + 1);
                cpu.pc = (cpu.pc + 3) & 0xffff;
                break;
            }
            case 0xc3:
                cpu.pc = this.read16(cpu.pc + 1);
                break;
            case 0x18: {
                const e = this.read8(cpu.pc + 1);
                const d = (e & 0x80) ? e - 0x100 : e;
                cpu.pc = (cpu.pc + 2 + d) & 0xffff;
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
                    if (stop)
                        return { stopped: true, reason: stop };
                    break;
                }
                this.push16(ret);
                cpu.pc = nn;
                break;
            }
            case 0xc9:
                cpu.pc = this.pop16();
                break;
            default:
                return { stopped: true, reason: `Unsupported opcode ${formatHex(op, 2)}H at ${formatHex(cpu.pc)}H` };
        }
        return { stopped: false };
    }
    run(maxSteps) {
        let left = maxSteps;
        while (left-- > 0) {
            const r = this.step();
            if (r.stopped)
                return r;
        }
        return { stopped: true, reason: `Step limit reached (${maxSteps})` };
    }
}
exports.Z80DebugCore = Z80DebugCore;
