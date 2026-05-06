"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printHexDump = printHexDump;
exports.printDisasm = printDisasm;
exports.runCommandScript = runCommandScript;
const disasm_1 = require("./disasm");
const core_1 = require("./core");
function printHexDump(mem, from, bytes) {
    const start = Math.max(0, Math.min(0xffff, from));
    const end = Math.max(start, Math.min(0x10000, start + bytes));
    for (let addr = start; addr < end; addr += 16) {
        const row = mem.slice(addr, Math.min(end, addr + 16));
        const hex = Array.from(row).map((b) => (0, core_1.formatHex)(b, 2)).join(" ");
        console.log(`${(0, core_1.formatHex)(addr)}: ${hex}`);
    }
}
function printDisasm(mem, from, count, addrToNames, addrToSource) {
    let addr = from & 0xffff;
    for (let i = 0; i < count && addr < 0x10000; i++) {
        const names = addrToNames.get(addr);
        if (names && names.length > 0)
            console.log(`${names.join(", ")}:`);
        const d = (0, disasm_1.decodeOne)(mem, addr, addr);
        const bytes = Array.from(mem.slice(addr, Math.min(0x10000, addr + d.size)))
            .map((b) => (0, core_1.formatHex)(b, 2))
            .join(" ");
        const targetNames = d.target != null ? addrToNames.get(d.target) : undefined;
        const note = targetNames && targetNames.length > 0 ? ` ; -> ${targetNames.join(", ")}` : "";
        const src = addrToSource?.get(addr);
        const srcNote = src ? ` ; ${src.file}:${src.line}` : "";
        console.log(`  ${(0, core_1.formatHex)(addr)}  ${bytes.padEnd(12)}  ${d.text}${note}${srcNote}`);
        addr += d.size;
    }
}
function printRegs(core) {
    const s = core.state;
    console.log(`A=${(0, core_1.formatHex)(s.a, 2)} F=${(0, core_1.formatHex)(s.f, 2)} BC=${(0, core_1.formatHex)((s.b << 8) | s.c)} DE=${(0, core_1.formatHex)((s.d << 8) | s.e)} HL=${(0, core_1.formatHex)((s.h << 8) | s.l)} IX=${(0, core_1.formatHex)(s.ix)} IY=${(0, core_1.formatHex)(s.iy)} SP=${(0, core_1.formatHex)(s.sp)} PC=${(0, core_1.formatHex)(s.pc)}`);
}
function printStepTrace(core, addrToNames, addrToSource) {
    printRegs(core);
    printDisasm(core.mem, core.state.pc, 1, addrToNames, addrToSource);
}
function printHelp() {
    console.log("commands:");
    console.log("  run|c [steps]");
    console.log("  step|s [n]");
    console.log("  trace on|off");
    console.log("  regs|r");
    console.log("  disas|u [addr] [count]");
    console.log("  mem|d [addr] [bytes]");
    console.log("  break|b add <addr>");
    console.log("  break|b del <addr>");
    console.log("  break|b list");
    console.log("  quit|q");
}
function runOneCommand(core, raw, addrToNames, ctx, addrToSource) {
    const line = raw.trim();
    if (!line)
        return true;
    const t = line.split(/\s+/);
    const cmd = t[0].toLowerCase();
    if (cmd === "help" || cmd === "h") {
        printHelp();
        return true;
    }
    if (cmd === "quit" || cmd === "q")
        return false;
    if (cmd === "regs" || cmd === "r") {
        printRegs(core);
        return true;
    }
    if (cmd === "step" || cmd === "s") {
        const n = t[1] ? (0, core_1.parseNum)(t[1]) : 1;
        for (let i = 0; i < n; i++) {
            if (ctx.traceEachStep) {
                printStepTrace(core, addrToNames, addrToSource);
            }
            const res = core.step();
            if (res.stopped) {
                console.log(`stop: ${res.reason}`);
                break;
            }
        }
        printRegs(core);
        return true;
    }
    if (cmd === "run" || cmd === "c") {
        const n = t[1] ? (0, core_1.parseNum)(t[1]) : 200000;
        let stopReason;
        for (let i = 0; i < n; i++) {
            if (ctx.traceEachStep) {
                printStepTrace(core, addrToNames, addrToSource);
            }
            const res = core.step();
            if (res.stopped) {
                stopReason = res.reason;
                break;
            }
        }
        if (!stopReason)
            stopReason = `Step limit reached (${n})`;
        console.log(`stop: ${stopReason}`);
        printRegs(core);
        return true;
    }
    if (cmd === "trace") {
        const mode = (t[1] ?? "").toLowerCase();
        if (mode === "on") {
            ctx.traceEachStep = true;
            console.log("trace: on");
            return true;
        }
        if (mode === "off") {
            ctx.traceEachStep = false;
            console.log("trace: off");
            return true;
        }
        throw new Error(`Invalid trace command: ${line}`);
    }
    if (cmd === "disas" || cmd === "u") {
        const addr = t[1] ? (0, core_1.parseNum)(t[1]) : core.state.pc;
        const count = t[2] ? (0, core_1.parseNum)(t[2]) : 16;
        printDisasm(core.mem, addr, count, addrToNames, addrToSource);
        return true;
    }
    if (cmd === "mem" || cmd === "d") {
        const addr = t[1] ? (0, core_1.parseNum)(t[1]) : core.state.pc;
        const bytes = t[2] ? (0, core_1.parseNum)(t[2]) : 64;
        printHexDump(core.mem, addr, bytes);
        return true;
    }
    if (cmd === "break" || cmd === "b") {
        const sub = (t[1] ?? "list").toLowerCase();
        if (sub === "list") {
            const points = [...core.breakpoints.values()].sort((a, b) => a - b).map((x) => `${(0, core_1.formatHex)(x)}H`);
            console.log(points.length ? `breakpoints: ${points.join(", ")}` : "breakpoints: (none)");
            return true;
        }
        if ((sub === "add" || sub === "del") && t[2]) {
            const addr = (0, core_1.parseNum)(t[2]) & 0xffff;
            if (sub === "add")
                core.breakpoints.add(addr);
            else
                core.breakpoints.delete(addr);
            return true;
        }
        throw new Error(`Invalid break command: ${line}`);
    }
    throw new Error(`Unknown command: ${line}`);
}
function runCommandScript(core, script, addrToNames, addrToSource) {
    const ctx = {
        traceEachStep: false,
    };
    const commands = script
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    for (const c of commands) {
        const keepGoing = runOneCommand(core, c, addrToNames, ctx, addrToSource);
        if (!keepGoing)
            break;
    }
}
