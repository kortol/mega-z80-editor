"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Z80DebugCore = void 0;
exports.parseNum = parseNum;
exports.formatHex = formatHex;
const fs = __importStar(require("fs"));
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
    lastExec = "";
    traceRing = [];
    traceMax = 32;
    imageStart = 0x0100;
    imageEnd = 0x0100;
    state = {
        a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, f: 0,
        sp: 0xfffe, pc: 0x0100,
        ix: 0x0000, iy: 0x0000,
    };
    dmaAddr = 0x0080;
    cpm = null;
    cpmRoot = process.cwd();
    cpmInteractive = false;
    cpmBdosTrace = false;
    inputQueue = [];
    shadow = { a: 0, f: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0 };
    allowOutOfImage = false;
    constructor(trace = false) {
        this.trace = trace;
        const { CpmBdos } = require("./cpm");
        this.cpm = new CpmBdos({
            read8: (addr) => this.read8(addr),
            write8: (addr, value) => this.write8(addr, value),
            getDma: () => this.dmaAddr,
            setDma: (addr) => { this.dmaAddr = addr & 0xffff; },
            output: (text) => this.out.push(text),
            rootDir: this.cpmRoot,
            trace: this.cpmBdosTrace,
            interactive: () => this.cpmInteractive,
            readConsoleChar: (blocking) => this.readConsoleChar(blocking),
            readConsoleLine: (maxLen) => this.readConsoleLine(maxLen),
        });
    }
    loadImage(image, base) {
        this.mem.fill(0);
        // CP/M conventional low-memory stubs.
        this.mem[0x0000] = 0xc3; // JP 0000 (warm boot loop sentinel)
        this.mem[0x0001] = 0x00;
        this.mem[0x0002] = 0x00;
        // CALL 0005h vector: JP F000h (typical CP/M style).
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
    }
    setEntry(entry) {
        this.state.pc = entry & 0xffff;
    }
    setCpmRoot(rootDir) {
        this.cpmRoot = rootDir;
        this.cpm?.setRootDir(rootDir);
    }
    setAllowOutOfImage(enabled) {
        this.allowOutOfImage = enabled;
    }
    setCpmInteractive(enabled) {
        this.cpmInteractive = enabled;
    }
    setCpmBdosTrace(enabled) {
        this.cpmBdosTrace = enabled;
        this.cpm?.setTrace(enabled);
    }
    setCommandTail(tail) {
        const raw = tail ?? "";
        const bytes = Buffer.from(raw, "ascii");
        const len = Math.min(127, bytes.length);
        this.mem[0x0080] = len & 0xff;
        for (let i = 0; i < len; i++)
            this.mem[0x0081 + i] = bytes[i] & 0x7f;
        this.mem[0x0081 + len] = 0x0d; // CP/M command tail terminator
        this.setDefaultFcbsFromTail(raw);
    }
    setDefaultFcbsFromTail(tail) {
        const tokens = tail
            .trim()
            .split(/\s+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        this.initFcb(0x005c);
        this.initFcb(0x006c);
        if (tokens.length > 0)
            this.fillFcbFromToken(0x005c, tokens[0]);
        if (tokens.length > 1)
            this.fillFcbFromToken(0x006c, tokens[1]);
    }
    initFcb(addr) {
        this.mem[addr] = 0x00; // default drive
        for (let i = 1; i <= 11; i++)
            this.mem[addr + i] = 0x20; // name/ext
        for (let i = 12; i < 36; i++)
            this.mem[addr + i] = 0x00;
    }
    fillFcbFromToken(addr, token) {
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
    fcbChar(ch) {
        if (ch === "*" || ch === "?")
            return 0x3f;
        const c = ch.charCodeAt(0) & 0x7f;
        if (c < 0x20 || c > 0x7e)
            return 0x20;
        return c;
    }
    getOutput() {
        return this.out.join("");
    }
    readConsoleChar(blocking) {
        if (this.inputQueue.length > 0) {
            return this.inputQueue.shift();
        }
        if (!blocking) {
            if (process.stdin.isTTY)
                return undefined;
            const buf = Buffer.alloc(1);
            const n = fs.readSync(0, buf, 0, 1, null);
            if (n <= 0)
                return undefined;
            const ch = buf[0] & 0xff;
            return ch === 0x0a ? 0x0d : ch;
        }
        const buf = Buffer.alloc(1);
        const n = fs.readSync(0, buf, 0, 1, null);
        if (n <= 0)
            return 0x0d;
        const ch = buf[0] & 0xff;
        return ch === 0x0a ? 0x0d : ch;
    }
    readConsoleLine(maxLen) {
        const chars = [];
        while (chars.length < Math.max(0, maxLen)) {
            const ch = this.readConsoleChar(true) ?? 0x0d;
            if (ch === 0x0d || ch === 0x0a)
                break;
            if (ch === 0x08 || ch === 0x7f) {
                if (chars.length > 0)
                    chars.pop();
                continue;
            }
            if (ch >= 0x20 && ch <= 0x7e)
                chars.push(ch);
        }
        return Buffer.from(chars).toString("ascii");
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
    static FLAG_S = 0x80;
    static FLAG_Z = 0x40;
    static FLAG_H = 0x10;
    static FLAG_PV = 0x04;
    static FLAG_N = 0x02;
    static FLAG_C = 0x01;
    parityEven(v) {
        let x = v & 0xff;
        x ^= x >> 4;
        x &= 0x0f;
        return ((0x6996 >> x) & 1) === 0;
    }
    packSZ(value) {
        const v = value & 0xff;
        let f = 0;
        if (v & 0x80)
            f |= Z80DebugCore.FLAG_S;
        if (v === 0)
            f |= Z80DebugCore.FLAG_Z;
        return f;
    }
    setZ(isZero) {
        if (isZero)
            this.state.f |= Z80DebugCore.FLAG_Z;
        else
            this.state.f &= ~Z80DebugCore.FLAG_Z;
    }
    addA(value, carryIn = 0) {
        const a = this.state.a & 0xff;
        const v = value & 0xff;
        const c = carryIn ? 1 : 0;
        const sum = a + v + c;
        const r = sum & 0xff;
        let f = this.packSZ(r);
        if (((a & 0x0f) + (v & 0x0f) + c) > 0x0f)
            f |= Z80DebugCore.FLAG_H;
        if ((~(a ^ v) & (a ^ r) & 0x80) !== 0)
            f |= Z80DebugCore.FLAG_PV;
        if (sum > 0xff)
            f |= Z80DebugCore.FLAG_C;
        this.state.a = r;
        this.state.f = f;
    }
    subA(value, carryIn = 0) {
        const a = this.state.a & 0xff;
        const v = value & 0xff;
        const c = carryIn ? 1 : 0;
        const diff = a - v - c;
        const r = diff & 0xff;
        let f = this.packSZ(r) | Z80DebugCore.FLAG_N;
        if (((a & 0x0f) - (v & 0x0f) - c) < 0)
            f |= Z80DebugCore.FLAG_H;
        if (((a ^ v) & (a ^ r) & 0x80) !== 0)
            f |= Z80DebugCore.FLAG_PV;
        if (diff < 0)
            f |= Z80DebugCore.FLAG_C;
        this.state.a = r;
        this.state.f = f;
    }
    cpA(value) {
        const a = this.state.a & 0xff;
        const v = value & 0xff;
        const diff = a - v;
        const r = diff & 0xff;
        let f = this.packSZ(r) | Z80DebugCore.FLAG_N;
        if ((a & 0x0f) < (v & 0x0f))
            f |= Z80DebugCore.FLAG_H;
        if (((a ^ v) & (a ^ r) & 0x80) !== 0)
            f |= Z80DebugCore.FLAG_PV;
        if (diff < 0)
            f |= Z80DebugCore.FLAG_C;
        this.state.f = f;
    }
    logicA(value, kind) {
        const a = this.state.a & 0xff;
        const v = value & 0xff;
        let r = 0;
        if (kind === "and")
            r = a & v;
        else if (kind === "or")
            r = a | v;
        else
            r = a ^ v;
        this.state.a = r & 0xff;
        let f = this.packSZ(this.state.a);
        if (kind === "and")
            f |= Z80DebugCore.FLAG_H;
        if (this.parityEven(this.state.a))
            f |= Z80DebugCore.FLAG_PV;
        this.state.f = f;
    }
    inc8(value) {
        const old = value & 0xff;
        const r = (old + 1) & 0xff;
        let f = (this.state.f & Z80DebugCore.FLAG_C) | this.packSZ(r);
        if ((old & 0x0f) === 0x0f)
            f |= Z80DebugCore.FLAG_H;
        if (old === 0x7f)
            f |= Z80DebugCore.FLAG_PV;
        this.state.f = f;
        return r;
    }
    dec8(value) {
        const old = value & 0xff;
        const r = (old - 1) & 0xff;
        let f = (this.state.f & Z80DebugCore.FLAG_C) | this.packSZ(r) | Z80DebugCore.FLAG_N;
        if ((old & 0x0f) === 0x00)
            f |= Z80DebugCore.FLAG_H;
        if (old === 0x80)
            f |= Z80DebugCore.FLAG_PV;
        this.state.f = f;
        return r;
    }
    setBitFlags(bit, value) {
        const oldCarry = this.state.f & Z80DebugCore.FLAG_C;
        const mask = 1 << (bit & 7);
        const isZero = (value & mask) === 0;
        let f = oldCarry | Z80DebugCore.FLAG_H;
        if (isZero)
            f |= Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV;
        if ((bit & 7) === 7 && (value & 0x80) !== 0)
            f |= Z80DebugCore.FLAG_S;
        this.state.f = f;
    }
    setShiftRotateFlags(result, carry) {
        let f = this.packSZ(result);
        if (this.parityEven(result))
            f |= Z80DebugCore.FLAG_PV;
        if (carry)
            f |= Z80DebugCore.FLAG_C;
        this.state.f = f;
    }
    getReg8(code) {
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
    setReg8(code, value) {
        const v = value & 0xff;
        switch (code & 7) {
            case 0:
                this.state.b = v;
                break;
            case 1:
                this.state.c = v;
                break;
            case 2:
                this.state.d = v;
                break;
            case 3:
                this.state.e = v;
                break;
            case 4:
                this.state.h = v;
                break;
            case 5:
                this.state.l = v;
                break;
            case 6:
                this.write8((this.state.h << 8) | this.state.l, v);
                break;
            case 7:
                this.state.a = v;
                break;
        }
    }
    bdosCall() {
        const fn = this.state.c & 0xff;
        if (!this.cpm) {
            this.state.a = 0x00;
            return undefined;
        }
        const res = this.cpm.handle(fn, this.state);
        return res;
    }
    step() {
        const cpu = this.state;
        if (cpu.pc === 0x0000) {
            const suffix = this.lastExec ? ` after ${this.lastExec}` : "";
            return this.stop(`PC reached 0000H (warm boot)${suffix}`);
        }
        if (cpu.pc === 0x0005) {
            const stop = this.bdosCall();
            cpu.pc = this.pop16();
            if (stop)
                return this.stop(stop);
            return { stopped: false };
        }
        if (this.breakpoints.has(cpu.pc)) {
            return this.stop(`Breakpoint hit at ${formatHex(cpu.pc)}H`);
        }
        const inImage = cpu.pc >= this.imageStart && cpu.pc < this.imageEnd;
        const inCpmVector = cpu.pc >= 0x0000 && cpu.pc < 0x0100;
        if (!this.allowOutOfImage && !inImage && !inCpmVector) {
            const suffix = this.lastExec ? ` after ${this.lastExec}` : "";
            return this.stop(`PC out of image range at ${formatHex(cpu.pc)}H (image=${formatHex(this.imageStart)}H-${formatHex((this.imageEnd - 1) & 0xffff)}H)${suffix}`);
        }
        const op = this.read8(cpu.pc);
        this.lastExec = `${formatHex(cpu.pc)}:${formatHex(op, 2)}H`;
        this.pushTrace(this.lastExec);
        if (this.trace) {
            console.log(`PC=${formatHex(cpu.pc)} OP=${formatHex(op, 2)} A=${formatHex(cpu.a, 2)} BC=${formatHex((cpu.b << 8) | cpu.c)} DE=${formatHex((cpu.d << 8) | cpu.e)} HL=${formatHex((cpu.h << 8) | cpu.l)} SP=${formatHex(cpu.sp)}`);
        }
        this.steps++;
        // IX/IY prefix handling (partial)
        if (op === 0xdd || op === 0xfd) {
            const useIy = op === 0xfd;
            const op2 = this.read8(cpu.pc + 1);
            const base = useIy ? cpu.iy : cpu.ix;
            const readDisp = () => {
                const e = this.read8(cpu.pc + 2);
                return (e & 0x80) ? e - 0x100 : e;
            };
            const setIndex = (v) => { if (useIy)
                cpu.iy = v & 0xffff;
            else
                cpu.ix = v & 0xffff; };
            const getIndex = () => (useIy ? cpu.iy : cpu.ix);
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
                        this.setBitFlags(y, old);
                        cpu.pc = (cpu.pc + 4) & 0xffff;
                        return { stopped: false };
                    }
                    if (grp === 0x02 || grp === 0x03) {
                        const value = grp === 0x02 ? (old & ~(1 << y)) : (old | (1 << y));
                        this.write8(addr, value);
                        if (r !== 0x06)
                            this.setReg8(r, value);
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
                    if (r !== 0x06)
                        this.setReg8(r, result);
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
                    setIndex((getIndex() + (((cpu.b << 8) | cpu.c) & 0xffff)) & 0xffff);
                    cpu.pc = (cpu.pc + 2) & 0xffff;
                    return { stopped: false };
                }
                case 0x19: { // ADD IX/IY,DE
                    setIndex((getIndex() + (((cpu.d << 8) | cpu.e) & 0xffff)) & 0xffff);
                    cpu.pc = (cpu.pc + 2) & 0xffff;
                    return { stopped: false };
                }
                case 0x29: { // ADD IX/IY,IX/IY
                    setIndex((getIndex() + getIndex()) & 0xffff);
                    cpu.pc = (cpu.pc + 2) & 0xffff;
                    return { stopped: false };
                }
                case 0x39: { // ADD IX/IY,SP
                    setIndex((getIndex() + (cpu.sp & 0xffff)) & 0xffff);
                    cpu.pc = (cpu.pc + 2) & 0xffff;
                    return { stopped: false };
                }
                case 0x2b: { // DEC IX/IY
                    setIndex((getIndex() - 1) & 0xffff);
                    cpu.pc = (cpu.pc + 2) & 0xffff;
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
                    if ((op2 & 0xc7) === 0x46 && op2 !== 0x76) { // LD r,(IX/IY+d)
                        const disp = readDisp();
                        const dst = (op2 >> 3) & 0x07;
                        const v = this.read8((base + disp) & 0xffff);
                        this.setReg8(dst, v);
                        cpu.pc = (cpu.pc + 3) & 0xffff;
                        return { stopped: false };
                    }
                    if ((op2 & 0xf8) === 0x70 && op2 !== 0x76) { // LD (IX/IY+d),r
                        const disp = readDisp();
                        const src = op2 & 0x07;
                        this.write8((base + disp) & 0xffff, this.getReg8(src));
                        cpu.pc = (cpu.pc + 3) & 0xffff;
                        return { stopped: false };
                    }
                    if ((op2 & 0xc7) === 0x86) { // ALU A,(IX/IY+d)
                        const disp = readDisp();
                        const v = this.read8((base + disp) & 0xffff);
                        switch ((op2 >> 3) & 0x07) {
                            case 0x00:
                                this.addA(v);
                                break; // ADD A,(idx+d)
                            case 0x01:
                                this.addA(v, (cpu.f & 0x01) ? 1 : 0);
                                break; // ADC
                            case 0x02:
                                this.subA(v);
                                break; // SUB
                            case 0x03:
                                this.subA(v, (cpu.f & 0x01) ? 1 : 0);
                                break; // SBC
                            case 0x04:
                                this.logicA(v, "and");
                                break; // AND
                            case 0x05:
                                this.logicA(v, "xor");
                                break; // XOR
                            case 0x06:
                                this.logicA(v, "or");
                                break; // OR
                            case 0x07:
                                this.cpA(v);
                                break; // CP
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
            case 0x00:
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x08: { // EX AF,AF'
                const sa = this.shadow.a;
                this.shadow.a = cpu.a;
                cpu.a = sa;
                const sf = this.shadow.f;
                this.shadow.f = cpu.f;
                cpu.f = sf;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x07: { // RLCA
                const c = (cpu.a >> 7) & 1;
                cpu.a = ((cpu.a << 1) | c) & 0xff;
                cpu.f = (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) | (c ? Z80DebugCore.FLAG_C : 0);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x0f: { // RRCA
                const c = cpu.a & 1;
                cpu.a = ((cpu.a >> 1) | (c << 7)) & 0xff;
                cpu.f = (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) | (c ? Z80DebugCore.FLAG_C : 0);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x17: { // RLA
                const oldC = cpu.f & Z80DebugCore.FLAG_C;
                const newC = (cpu.a >> 7) & 1;
                cpu.a = ((cpu.a << 1) | oldC) & 0xff;
                cpu.f = (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) | (newC ? Z80DebugCore.FLAG_C : 0);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x1f: { // RRA
                const oldC = cpu.f & Z80DebugCore.FLAG_C;
                const newC = cpu.a & Z80DebugCore.FLAG_C;
                cpu.a = ((cpu.a >> 1) | (oldC << 7)) & 0xff;
                cpu.f = (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) | (newC ? Z80DebugCore.FLAG_C : 0);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x27: { // DAA
                const oldA = cpu.a & 0xff;
                const oldC = (cpu.f & Z80DebugCore.FLAG_C) !== 0;
                const oldH = (cpu.f & Z80DebugCore.FLAG_H) !== 0;
                const isSub = (cpu.f & Z80DebugCore.FLAG_N) !== 0;
                let adjust = 0;
                let carryOut = oldC;
                if (!isSub) {
                    if (oldH || (oldA & 0x0f) > 9)
                        adjust |= 0x06;
                    if (oldC || oldA > 0x99) {
                        adjust |= 0x60;
                        carryOut = true;
                    }
                    cpu.a = (oldA + adjust) & 0xff;
                }
                else {
                    if (oldH)
                        adjust |= 0x06;
                    if (oldC)
                        adjust |= 0x60;
                    cpu.a = (oldA - adjust) & 0xff;
                }
                let f = this.packSZ(cpu.a) | (isSub ? Z80DebugCore.FLAG_N : 0);
                if (this.parityEven(cpu.a))
                    f |= Z80DebugCore.FLAG_PV;
                if (((oldA ^ cpu.a ^ adjust) & 0x10) !== 0)
                    f |= Z80DebugCore.FLAG_H;
                if (carryOut)
                    f |= Z80DebugCore.FLAG_C;
                cpu.f = f;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x76: return this.stop("HALT");
            case 0x3e:
                cpu.a = this.read8(cpu.pc + 1);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x01: {
                const nn = this.read16(cpu.pc + 1);
                cpu.b = (nn >> 8) & 0xff;
                cpu.c = nn & 0xff;
                cpu.pc = (cpu.pc + 3) & 0xffff;
                break;
            }
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
            case 0x26:
                cpu.h = this.read8(cpu.pc + 1);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x2e:
                cpu.l = this.read8(cpu.pc + 1);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x0a:
                cpu.a = this.read8((cpu.b << 8) | cpu.c);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // LD A,(BC)
            case 0x1a:
                cpu.a = this.read8((cpu.d << 8) | cpu.e);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // LD A,(DE)
            case 0x02:
                this.write8((cpu.b << 8) | cpu.c, cpu.a);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // LD (BC),A
            case 0x12:
                this.write8((cpu.d << 8) | cpu.e, cpu.a);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // LD (DE),A
            case 0x04:
                cpu.b = this.inc8(cpu.b);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // INC B
            case 0x05:
                cpu.b = this.dec8(cpu.b);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // DEC B
            case 0x0c:
                cpu.c = this.inc8(cpu.c);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // INC C
            case 0x0d:
                cpu.c = this.dec8(cpu.c);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // DEC C
            case 0x14:
                cpu.d = this.inc8(cpu.d);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // INC D
            case 0x15:
                cpu.d = this.dec8(cpu.d);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // DEC D
            case 0x1c:
                cpu.e = this.inc8(cpu.e);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // INC E
            case 0x1d:
                cpu.e = this.dec8(cpu.e);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // DEC E
            case 0x24:
                cpu.h = this.inc8(cpu.h);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // INC H
            case 0x25:
                cpu.h = this.dec8(cpu.h);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // DEC H
            case 0x2c:
                cpu.l = this.inc8(cpu.l);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // INC L
            case 0x2d:
                cpu.l = this.dec8(cpu.l);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // DEC L
            case 0x2f: // CPL
                cpu.a = (~cpu.a) & 0xff;
                cpu.f = (cpu.f & ~(Z80DebugCore.FLAG_H | Z80DebugCore.FLAG_N)) | Z80DebugCore.FLAG_H | Z80DebugCore.FLAG_N;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x3c:
                cpu.a = this.inc8(cpu.a);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // INC A
            case 0x3d:
                cpu.a = this.dec8(cpu.a);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // DEC A
            case 0x37: // SCF
                cpu.f = (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) | Z80DebugCore.FLAG_C;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x3f: { // CCF
                const oldC = cpu.f & Z80DebugCore.FLAG_C;
                cpu.f = (cpu.f & (Z80DebugCore.FLAG_S | Z80DebugCore.FLAG_Z | Z80DebugCore.FLAG_PV)) |
                    (oldC ? Z80DebugCore.FLAG_H : 0) |
                    (oldC ? 0 : Z80DebugCore.FLAG_C);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x36:
                this.write8((cpu.h << 8) | cpu.l, this.read8(cpu.pc + 1));
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0x23: {
                const hl = ((cpu.h << 8) | cpu.l) + 1;
                cpu.h = (hl >> 8) & 0xff;
                cpu.l = hl & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x03: {
                const bc = ((cpu.b << 8) | cpu.c) + 1;
                cpu.b = (bc >> 8) & 0xff;
                cpu.c = bc & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x13: {
                const de = ((cpu.d << 8) | cpu.e) + 1;
                cpu.d = (de >> 8) & 0xff;
                cpu.e = de & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x33:
                cpu.sp = (cpu.sp + 1) & 0xffff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x0b: {
                const bc = ((cpu.b << 8) | cpu.c) - 1;
                cpu.b = (bc >> 8) & 0xff;
                cpu.c = bc & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x1b: {
                const de = ((cpu.d << 8) | cpu.e) - 1;
                cpu.d = (de >> 8) & 0xff;
                cpu.e = de & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x2b: {
                const hl = ((cpu.h << 8) | cpu.l) - 1;
                cpu.h = (hl >> 8) & 0xff;
                cpu.l = hl & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x3b:
                cpu.sp = (cpu.sp - 1) & 0xffff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x4e:
                cpu.c = this.read8((cpu.h << 8) | cpu.l);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // LD C,(HL)
            case 0x77:
                this.write8((cpu.h << 8) | cpu.l, cpu.a);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x7e:
                cpu.a = this.read8((cpu.h << 8) | cpu.l);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x5f:
                cpu.e = cpu.a & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break; // LD E,A
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
                this.logicA(cpu.a, "xor");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xa8:
                this.logicA(cpu.b, "xor");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xa9:
                this.logicA(cpu.c, "xor");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xaa:
                this.logicA(cpu.d, "xor");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xab:
                this.logicA(cpu.e, "xor");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xac:
                this.logicA(cpu.h, "xor");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xad:
                this.logicA(cpu.l, "xor");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xae:
                this.logicA(this.read8((cpu.h << 8) | cpu.l), "xor");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb7:
                this.logicA(cpu.a, "or");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xe6:
                this.logicA(this.read8(cpu.pc + 1), "and");
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0xf6:
                this.logicA(this.read8(cpu.pc + 1), "or");
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0xde: { // SBC A,n (carry handling simplified)
                const n = this.read8(cpu.pc + 1);
                const c = (cpu.f & 0x01) ? 1 : 0;
                this.subA(n, c);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            }
            case 0xee:
                this.logicA(this.read8(cpu.pc + 1), "xor");
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0xfe: {
                this.cpA(this.read8(cpu.pc + 1));
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            }
            case 0xb9:
                this.cpA(cpu.c);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb8:
                this.cpA(cpu.b);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xba:
                this.cpA(cpu.d);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xbb:
                this.cpA(cpu.e);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xbc:
                this.cpA(cpu.h);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xbd:
                this.cpA(cpu.l);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xbe:
                this.cpA(this.read8((cpu.h << 8) | cpu.l));
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xbf:
                this.cpA(cpu.a);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x80:
                this.addA(cpu.b);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x81:
                this.addA(cpu.c);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x82:
                this.addA(cpu.d);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x83:
                this.addA(cpu.e);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x84:
                this.addA(cpu.h);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x85:
                this.addA(cpu.l);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x86:
                this.addA(this.read8((cpu.h << 8) | cpu.l));
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x87:
                this.addA(cpu.a);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xc6:
                this.addA(this.read8(cpu.pc + 1));
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0xce: {
                const n = this.read8(cpu.pc + 1);
                const c = (cpu.f & 0x01) ? 1 : 0;
                this.addA(n, c);
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            }
            case 0x32:
                this.write8(this.read16(cpu.pc + 1), cpu.a);
                cpu.pc = (cpu.pc + 3) & 0xffff;
                break;
            case 0x3a:
                cpu.a = this.read8(this.read16(cpu.pc + 1));
                cpu.pc = (cpu.pc + 3) & 0xffff;
                break; // LD A,(nn)
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
                const d = cpu.d;
                const e = cpu.e;
                cpu.d = cpu.h;
                cpu.e = cpu.l;
                cpu.h = d;
                cpu.l = e;
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
                cpu.h = hi;
                cpu.l = lo;
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
                cpu.pc = !z ? this.pop16() : (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0xc8: { // RET Z
                const z = (cpu.f & 0x40) !== 0;
                cpu.pc = z ? this.pop16() : (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0xd0: { // RET NC
                const c = (cpu.f & 0x01) !== 0;
                cpu.pc = !c ? this.pop16() : (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0xd8: { // RET C
                const c = (cpu.f & 0x01) !== 0;
                cpu.pc = c ? this.pop16() : (cpu.pc + 1) & 0xffff;
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
            case 0xc4: { // CALL NZ,nn
                const nn = this.read16(cpu.pc + 1);
                const ret = (cpu.pc + 3) & 0xffff;
                const z = (cpu.f & 0x40) !== 0;
                if (!z) {
                    this.push16(ret);
                    cpu.pc = nn;
                }
                else {
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
                    cpu.pc = nn;
                }
                else {
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
                    cpu.pc = nn;
                }
                else {
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
                    cpu.pc = nn;
                }
                else {
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
                    cpu.pc = nn;
                }
                else {
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
                    cpu.pc = nn;
                }
                else {
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
                    cpu.pc = nn;
                }
                else {
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
                    cpu.pc = nn;
                }
                else {
                    cpu.pc = ret;
                }
                break;
            }
            case 0xc9:
                cpu.pc = this.pop16();
                break;
            case 0xc5:
                this.push16((cpu.b << 8) | cpu.c);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xd5:
                this.push16((cpu.d << 8) | cpu.e);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xe5:
                this.push16((cpu.h << 8) | cpu.l);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xf5:
                this.push16((cpu.a << 8) | cpu.f);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xc1: {
                const v = this.pop16();
                cpu.b = (v >> 8) & 0xff;
                cpu.c = v & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0xd1: {
                const v = this.pop16();
                cpu.d = (v >> 8) & 0xff;
                cpu.e = v & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0xe1: {
                const v = this.pop16();
                cpu.h = (v >> 8) & 0xff;
                cpu.l = v & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0xf1: {
                const v = this.pop16();
                cpu.a = (v >> 8) & 0xff;
                cpu.f = v & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x09: { // ADD HL,BC
                const hl = ((cpu.h << 8) | cpu.l) + ((cpu.b << 8) | cpu.c);
                cpu.h = (hl >> 8) & 0xff;
                cpu.l = hl & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x19: { // ADD HL,DE
                const hl = ((cpu.h << 8) | cpu.l) + ((cpu.d << 8) | cpu.e);
                cpu.h = (hl >> 8) & 0xff;
                cpu.l = hl & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x29: { // ADD HL,HL
                const hl = ((cpu.h << 8) | cpu.l) * 2;
                cpu.h = (hl >> 8) & 0xff;
                cpu.l = hl & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x39: { // ADD HL,SP
                const hl = ((cpu.h << 8) | cpu.l) + cpu.sp;
                cpu.h = (hl >> 8) & 0xff;
                cpu.l = hl & 0xff;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0x90:
                this.subA(cpu.b);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x91:
                this.subA(cpu.c);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x92:
                this.subA(cpu.d);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x93:
                this.subA(cpu.e);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x94:
                this.subA(cpu.h);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x95:
                this.subA(cpu.l);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x96:
                this.subA(this.read8((cpu.h << 8) | cpu.l));
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0x97:
                this.subA(cpu.a);
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xd6:
                this.subA(this.read8(cpu.pc + 1));
                cpu.pc = (cpu.pc + 2) & 0xffff;
                break;
            case 0xd9: { // EXX
                const sb = this.shadow.b;
                this.shadow.b = cpu.b;
                cpu.b = sb;
                const sc = this.shadow.c;
                this.shadow.c = cpu.c;
                cpu.c = sc;
                const sd = this.shadow.d;
                this.shadow.d = cpu.d;
                cpu.d = sd;
                const se = this.shadow.e;
                this.shadow.e = cpu.e;
                cpu.e = se;
                const sh = this.shadow.h;
                this.shadow.h = cpu.h;
                cpu.h = sh;
                const sl = this.shadow.l;
                this.shadow.l = cpu.l;
                cpu.l = sl;
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0xa0:
                this.logicA(cpu.b, "and");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xa1:
                this.logicA(cpu.c, "and");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xa2:
                this.logicA(cpu.d, "and");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xa3:
                this.logicA(cpu.e, "and");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xa4:
                this.logicA(cpu.h, "and");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xa5:
                this.logicA(cpu.l, "and");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xa6:
                this.logicA(this.read8((cpu.h << 8) | cpu.l), "and");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xa7:
                this.logicA(cpu.a, "and");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb0:
                this.logicA(cpu.b, "or");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb1:
                this.logicA(cpu.c, "or");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb2:
                this.logicA(cpu.d, "or");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb3:
                this.logicA(cpu.e, "or");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb4:
                this.logicA(cpu.h, "or");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb5:
                this.logicA(cpu.l, "or");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xb6:
                this.logicA(this.read8((cpu.h << 8) | cpu.l), "or");
                cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            case 0xf0: { // RET P
                const s = (cpu.f & 0x80) !== 0;
                if (!s)
                    cpu.pc = this.pop16();
                else
                    cpu.pc = (cpu.pc + 1) & 0xffff;
                break;
            }
            case 0xf8: { // RET M
                const s = (cpu.f & 0x80) !== 0;
                if (s)
                    cpu.pc = this.pop16();
                else
                    cpu.pc = (cpu.pc + 1) & 0xffff;
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
            case 0xc7: // RST 0
            case 0xcf: // RST 8
            case 0xd7: // RST 10
            case 0xdf: // RST 18
            case 0xe7: // RST 20
            case 0xef: // RST 28
            case 0xf7: // RST 30
            case 0xff: { // RST 38
                const vec = op & 0x38;
                this.push16((cpu.pc + 1) & 0xffff);
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
                const readR = () => this.getReg8(r) & 0xff;
                const writeR = (v) => { this.setReg8(r, v & 0xff); };
                if (grp === 0x01) { // BIT y,r
                    const v = readR();
                    this.setBitFlags(y, v);
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
                    cpu.b = (bc >> 8) & 0xff;
                    cpu.c = bc & 0xff;
                    cpu.h = (hl >> 8) & 0xff;
                    cpu.l = hl & 0xff;
                    cpu.d = (de >> 8) & 0xff;
                    cpu.e = de & 0xff;
                    cpu.pc = (cpu.pc + 2) & 0xffff;
                    break;
                }
                if (op2 === 0xb8) { // LDDR
                    let bc = ((cpu.b << 8) | cpu.c) & 0xffff;
                    let hl = ((cpu.h << 8) | cpu.l) & 0xffff;
                    let de = ((cpu.d << 8) | cpu.e) & 0xffff;
                    while (bc > 0) {
                        this.write8(de, this.read8(hl));
                        hl = (hl - 1) & 0xffff;
                        de = (de - 1) & 0xffff;
                        bc = (bc - 1) & 0xffff;
                    }
                    cpu.b = (bc >> 8) & 0xff;
                    cpu.c = bc & 0xff;
                    cpu.h = (hl >> 8) & 0xff;
                    cpu.l = hl & 0xff;
                    cpu.d = (de >> 8) & 0xff;
                    cpu.e = de & 0xff;
                    cpu.pc = (cpu.pc + 2) & 0xffff;
                    break;
                }
                if (op2 === 0xb1) { // CPIR
                    let bc = ((cpu.b << 8) | cpu.c) & 0xffff;
                    let hl = ((cpu.h << 8) | cpu.l) & 0xffff;
                    let found = false;
                    while (bc > 0) {
                        const v = this.read8(hl);
                        const r = (cpu.a - v) & 0xff;
                        if (r === 0) {
                            found = true;
                            hl = (hl + 1) & 0xffff;
                            bc = (bc - 1) & 0xffff;
                            break;
                        }
                        hl = (hl + 1) & 0xffff;
                        bc = (bc - 1) & 0xffff;
                    }
                    cpu.b = (bc >> 8) & 0xff;
                    cpu.c = bc & 0xff;
                    cpu.h = (hl >> 8) & 0xff;
                    cpu.l = hl & 0xff;
                    this.setZ(found);
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
                if (op2 === 0x42 || op2 === 0x52 || op2 === 0x62 || op2 === 0x72) { // SBC HL,rr
                    const hl = ((cpu.h << 8) | cpu.l) & 0xffff;
                    const carry = (cpu.f & 0x01) ? 1 : 0;
                    const rr = op2 === 0x42 ? ((cpu.b << 8) | cpu.c) :
                        op2 === 0x52 ? ((cpu.d << 8) | cpu.e) :
                            op2 === 0x62 ? ((cpu.h << 8) | cpu.l) :
                                cpu.sp;
                    const diff = hl - rr - carry;
                    const res = diff & 0xffff;
                    cpu.h = (res >> 8) & 0xff;
                    cpu.l = res & 0xff;
                    let f = 0;
                    if (res & 0x8000)
                        f |= Z80DebugCore.FLAG_S;
                    if (res === 0)
                        f |= Z80DebugCore.FLAG_Z;
                    if (((hl ^ rr ^ res) & 0x1000) !== 0)
                        f |= Z80DebugCore.FLAG_H;
                    if (((hl ^ rr) & (hl ^ res) & 0x8000) !== 0)
                        f |= Z80DebugCore.FLAG_PV;
                    f |= Z80DebugCore.FLAG_N;
                    if (diff < 0)
                        f |= Z80DebugCore.FLAG_C;
                    cpu.f = f;
                    cpu.pc = (cpu.pc + 2) & 0xffff;
                    break;
                }
                if (op2 === 0x4a || op2 === 0x5a || op2 === 0x6a || op2 === 0x7a) { // ADC HL,rr
                    const hl = ((cpu.h << 8) | cpu.l) & 0xffff;
                    const carry = (cpu.f & 0x01) ? 1 : 0;
                    const rr = op2 === 0x4a ? ((cpu.b << 8) | cpu.c) :
                        op2 === 0x5a ? ((cpu.d << 8) | cpu.e) :
                            op2 === 0x6a ? ((cpu.h << 8) | cpu.l) :
                                cpu.sp;
                    const sum = hl + rr + carry;
                    const res = sum & 0xffff;
                    cpu.h = (res >> 8) & 0xff;
                    cpu.l = res & 0xff;
                    let f = 0;
                    if (res & 0x8000)
                        f |= Z80DebugCore.FLAG_S;
                    if (res === 0)
                        f |= Z80DebugCore.FLAG_Z;
                    if (((hl & 0x0fff) + (rr & 0x0fff) + carry) > 0x0fff)
                        f |= Z80DebugCore.FLAG_H;
                    if ((~(hl ^ rr) & (hl ^ res) & 0x8000) !== 0)
                        f |= Z80DebugCore.FLAG_PV;
                    if (sum > 0xffff)
                        f |= Z80DebugCore.FLAG_C;
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
    run(maxSteps) {
        let left = maxSteps;
        while (left-- > 0) {
            const r = this.step();
            if (r.stopped)
                return r;
        }
        return this.stop(`Step limit reached (${maxSteps})`);
    }
    pushTrace(entry) {
        this.traceRing.push(entry);
        if (this.traceRing.length > this.traceMax) {
            this.traceRing.shift();
        }
    }
    getTraceTail() {
        return [...this.traceRing];
    }
    stop(reason) {
        return { stopped: true, reason, history: this.getTraceTail() };
    }
}
exports.Z80DebugCore = Z80DebugCore;
