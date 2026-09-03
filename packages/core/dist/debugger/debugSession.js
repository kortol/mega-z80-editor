"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Z80DebugSession = void 0;
class Z80DebugSession {
    core;
    breakpoints = new Map();
    sourceEntries;
    addrToSource = new Map();
    nextBpId = 1;
    constructor(core, sourceEntries = []) {
        this.core = core;
        this.sourceEntries = sourceEntries.map((e) => ({
            ...e,
            addr: e.addr & 0xffff,
            size: Math.max(1, e.size | 0),
            line: Math.max(1, e.line | 0),
            column: e.column != null ? Math.max(1, e.column | 0) : undefined,
        }));
        for (const e of this.sourceEntries) {
            for (let i = 0; i < e.size; i++) {
                const a = (e.addr + i) & 0xffff;
                if (!this.addrToSource.has(a))
                    this.addrToSource.set(a, e);
            }
        }
    }
    resetBreakpoints() {
        this.core.breakpoints.clear();
        this.breakpoints.clear();
    }
    run(maxSteps) {
        const first = this.stepOverCurrentBreakpointIfNeeded();
        if (first) {
            if (first.stopped) {
                return {
                    stop: this.mapStopReason(first),
                    history: first.history ?? [],
                };
            }
            if (maxSteps <= 1) {
                return {
                    stop: { kind: "step", message: "Stepped 1 instruction(s)" },
                    history: first.history ?? [],
                };
            }
        }
        const res = this.core.run(first ? maxSteps - 1 : maxSteps);
        return {
            stop: this.mapStopReason(res),
            history: res.history ?? [],
        };
    }
    stepInstruction(count = 1) {
        const n = Math.max(1, count | 0);
        let last = { stopped: false };
        for (let i = 0; i < n; i++) {
            last = this.stepOverCurrentBreakpointIfNeeded() ?? this.core.step();
            if (last.stopped)
                break;
        }
        if (!last.stopped) {
            return { stop: { kind: "step", message: `Stepped ${n} instruction(s)` }, history: [] };
        }
        return {
            stop: this.mapStopReason(last),
            history: last.history ?? [],
        };
    }
    pause() {
        return { kind: "pause", message: "Pause requested" };
    }
    getRegisters() {
        return this.core.getRegisters();
    }
    setRegisters(partial) {
        this.core.setRegisters(partial);
        return this.core.getRegisters();
    }
    readMemory(addr, len) {
        return this.core.readMemory(addr, len);
    }
    writeMemory(addr, data) {
        this.core.writeMemory(addr, data);
    }
    readPort(port) {
        return this.core.readPort(port);
    }
    writePort(port, value) {
        this.core.writePort(port, value);
    }
    addBreakpoint(input) {
        const id = input.id ?? `bp-${this.nextBpId++}`;
        const bp = { ...input, id };
        this.breakpoints.set(id, bp);
        this.applyBreakpoint(bp);
        return bp;
    }
    removeBreakpoint(id) {
        const bp = this.breakpoints.get(id);
        if (!bp)
            return false;
        this.unapplyBreakpoint(bp);
        this.breakpoints.delete(id);
        return true;
    }
    listBreakpoints() {
        return [...this.breakpoints.values()];
    }
    getTimeState() {
        return {
            instructionCount: this.core.steps,
            tstateTotal: String(this.core.steps),
        };
    }
    getCallStack() {
        return this.core.getCallStack();
    }
    getOutput() {
        return this.core.getOutput();
    }
    queueConsoleInput(text, appendCr = false) {
        return this.core.queueConsoleInput(text, appendCr);
    }
    resolveAddress(addr) {
        const a = addr & 0xffff;
        const e = this.addrToSource.get(a);
        if (!e)
            return null;
        return {
            addr: a,
            file: e.file,
            line: e.line,
            column: e.column,
            module: e.module,
            section: e.section,
        };
    }
    resolveLocation(loc) {
        const file = this.normalizePath(loc.file);
        const line = Math.max(1, loc.line | 0);
        const col = loc.column != null ? Math.max(1, loc.column | 0) : undefined;
        const out = new Set();
        for (const e of this.sourceEntries) {
            if (!this.isSameSourceFile(e.file, file))
                continue;
            if (e.line !== line)
                continue;
            if (col != null && e.column != null && e.column !== col)
                continue;
            out.add(e.addr & 0xffff);
        }
        return [...out].sort((a, b) => a - b);
    }
    applyBreakpoint(bp) {
        if (!bp.enabled)
            return;
        if (bp.kind === "exec") {
            this.core.breakpoints.add(bp.addr & 0xffff);
        }
    }
    unapplyBreakpoint(bp) {
        if (bp.kind === "exec") {
            this.core.breakpoints.delete(bp.addr & 0xffff);
        }
    }
    mapStopReason(res) {
        const msg = res.reason ?? "stopped";
        if (/^Breakpoint hit at /i.test(msg)) {
            const m = /at\s+([0-9A-F]{4})H/i.exec(msg);
            const addr = m ? Number.parseInt(m[1], 16) : undefined;
            const match = addr != null
                ? [...this.breakpoints.values()].find((b) => b.kind === "exec" && (b.addr & 0xffff) === addr)
                : undefined;
            return { kind: "breakpoint", breakpointId: match?.id, address: addr, message: msg };
        }
        if (/HALT/i.test(msg))
            return { kind: "halt", message: msg };
        if (/PC reached 0000H|target exit|warm boot/i.test(msg))
            return { kind: "targetExit", message: msg };
        if (/Step limit reached/i.test(msg))
            return { kind: "step", message: msg };
        if (/Unsupported opcode|Invalid|out of image range/i.test(msg)) {
            return { kind: "exception", message: msg };
        }
        return { kind: "exception", message: msg };
    }
    normalizePath(p) {
        return String(p ?? "").replace(/\\/g, "/").toLowerCase();
    }
    isSameSourceFile(entryFile, requestedFile) {
        const a = this.normalizePath(entryFile);
        const b = this.normalizePath(requestedFile);
        if (!a || !b)
            return false;
        if (a === b)
            return true;
        return a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
    }
    stepOverCurrentBreakpointIfNeeded() {
        const pc = this.core.getRegisters().pc & 0xffff;
        const bp = [...this.breakpoints.values()].find((entry) => entry.kind === "exec" && entry.enabled && (entry.addr & 0xffff) === pc);
        if (!bp)
            return null;
        this.unapplyBreakpoint(bp);
        try {
            return this.core.step();
        }
        finally {
            this.applyBreakpoint(bp);
        }
    }
}
exports.Z80DebugSession = Z80DebugSession;
