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
exports.printDisasm = void 0;
exports.dbgBinary = dbgBinary;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const symbols_1 = require("./symbols");
const disasm_1 = require("./disasm");
const core_1 = require("./core");
const commandRunner_1 = require("./commandRunner");
Object.defineProperty(exports, "printDisasm", { enumerable: true, get: function () { return commandRunner_1.printDisasm; } });
function printStaticDisasm(buf, base, from, count, addrToNames) {
    let off = Math.max(0, from - base);
    let n = 0;
    while (off < buf.length && n < count) {
        const addr = base + off;
        const names = addrToNames.get(addr);
        if (names && names.length > 0)
            console.log(`${names.join(", ")}:`);
        const d = (0, disasm_1.decodeOne)(buf, off, addr);
        const bytes = Array.from(buf.slice(off, Math.min(buf.length, off + d.size)))
            .map((b) => (0, core_1.formatHex)(b, 2))
            .join(" ");
        const targetNames = d.target != null ? addrToNames.get(d.target) : undefined;
        const note = targetNames && targetNames.length > 0 ? ` ; -> ${targetNames.join(", ")}` : "";
        console.log(`  ${(0, core_1.formatHex)(addr)}  ${bytes.padEnd(12)}  ${d.text}${note}`);
        off += d.size;
        n++;
    }
}
function dbgBinary(inputFile, opts) {
    const absInput = path.resolve(inputFile);
    const data = fs.readFileSync(absInput);
    const defaultBase = /\.com$/i.test(absInput) ? 0x100 : 0;
    const base = opts.base ? (0, core_1.parseNum)(opts.base) : defaultBase;
    const from = opts.from ? (0, core_1.parseNum)(opts.from) : base;
    const bytes = opts.bytes ? (0, core_1.parseNum)(opts.bytes) : 0x80;
    const decodeCount = opts.decode ? (0, core_1.parseNum)(opts.decode) : 24;
    const entry = opts.entry ? (0, core_1.parseNum)(opts.entry) : 0x0100;
    const maxSteps = opts.steps ? (0, core_1.parseNum)(opts.steps) : 200000;
    const symPath = opts.sym
        ? path.resolve(opts.sym)
        : fs.existsSync(absInput.replace(/\.[^.]+$/, ".sym"))
            ? absInput.replace(/\.[^.]+$/, ".sym")
            : undefined;
    const symEntries = symPath ? (0, symbols_1.parseSymFile)(symPath) : [];
    const addrToNames = (0, symbols_1.buildAddrToNames)(symEntries);
    console.log(`file   : ${absInput}`);
    console.log(`size   : ${data.length} bytes`);
    console.log(`base   : ${(0, core_1.formatHex)(base)}H`);
    console.log(`from   : ${(0, core_1.formatHex)(from)}H`);
    console.log(`sym    : ${symPath ?? "(none)"}`);
    const core = new core_1.Z80DebugCore(!!opts.trace);
    if (opts.cpm) {
        core.setAllowOutOfImage(true);
        core.setCpmInteractive(!!opts.cpmInteractive);
        core.setCpmBdosTrace(!!opts.bdosTrace);
    }
    if (opts.cpmRoot) {
        core.setCpmRoot(path.resolve(opts.cpmRoot));
    }
    core.loadImage(data, base);
    if (opts.tail) {
        core.setCommandTail(opts.tail);
    }
    core.setEntry(entry);
    if (opts.cmd) {
        console.log("");
        console.log("[Command]");
        (0, commandRunner_1.runCommandScript)(core, opts.cmd, addrToNames);
        const out = core.getOutput();
        if (out.length > 0) {
            console.log("[BDOS Output]");
            process.stdout.write(out);
            if (!out.endsWith("\n"))
                process.stdout.write("\n");
        }
        return;
    }
    console.log("");
    console.log("[HexDump]");
    (0, commandRunner_1.printHexDump)(core.mem, from, bytes);
    console.log("");
    console.log("[Decode]");
    printStaticDisasm(data, base, from, decodeCount, addrToNames);
    if (opts.cpm) {
        console.log("");
        console.log("[CP/M Run]");
        const result = core.run(maxSteps);
        console.log(`reason : ${result.reason}`);
        console.log(`steps  : ${core.steps}`);
        console.log(`pc/sp  : ${(0, core_1.formatHex)(core.state.pc)}H / ${(0, core_1.formatHex)(core.state.sp)}H`);
        if (result.history && result.history.length > 0) {
            console.log("history:");
            console.log(result.history.join(" "));
        }
        const out = core.getOutput();
        if (out.length > 0) {
            console.log("output :");
            process.stdout.write(out);
            if (!out.endsWith("\n"))
                process.stdout.write("\n");
        }
        else {
            console.log("output : (none)");
        }
    }
    if (!opts.cpm) {
        console.log("");
        console.log("[Hint] Use --cmd \"break 0100h; run 1000; regs\" for command mode.");
        console.log("[Hint] Use --cpm to run immediately.");
    }
}
