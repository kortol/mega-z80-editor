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
const debugSession_1 = require("./debugSession");
const commandRunner_1 = require("./commandRunner");
Object.defineProperty(exports, "printDisasm", { enumerable: true, get: function () { return commandRunner_1.printDisasm; } });
const rpcServer_1 = require("./rpcServer");
const sourceMap_1 = require("./sourceMap");
function printStaticDisasm(buf, base, from, count, addrToNames, addrToSource) {
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
        const src = addrToSource?.get(addr);
        const srcNote = src ? ` ; ${src.file}:${src.line}` : "";
        console.log(`  ${(0, core_1.formatHex)(addr)}  ${bytes.padEnd(12)}  ${d.text}${note}${srcNote}`);
        off += d.size;
        n++;
    }
}
function dbgBinary(inputFile, opts) {
    const absInput = path.resolve(inputFile);
    if (!opts.loadState && !fs.existsSync(absInput)) {
        throw new Error(`Input file not found: ${absInput}`);
    }
    const data = fs.existsSync(absInput) ? fs.readFileSync(absInput) : Buffer.alloc(0);
    const defaultBase = /\.com$/i.test(absInput) ? 0x100 : 0;
    const base = opts.base ? (0, core_1.parseNum)(opts.base) : defaultBase;
    const from = opts.from ? (0, core_1.parseNum)(opts.from) : base;
    const bytes = opts.bytes ? (0, core_1.parseNum)(opts.bytes) : 0x80;
    const decodeCount = opts.decode ? (0, core_1.parseNum)(opts.decode) : 24;
    const entry = opts.entry ? (0, core_1.parseNum)(opts.entry) : 0x0100;
    const maxSteps = opts.steps ? (0, core_1.parseNum)(opts.steps) : 200000;
    const progressEvery = opts.progressEvery ? (0, core_1.parseNum)(opts.progressEvery) : 0;
    const saveStatePath = opts.saveState ? path.resolve(opts.saveState) : undefined;
    const loadStatePath = opts.loadState ? path.resolve(opts.loadState) : undefined;
    const saveStateEvery = opts.saveStateEvery ? (0, core_1.parseNum)(opts.saveStateEvery) : 0;
    const tickEvery = progressEvery > 0
        ? progressEvery
        : saveStateEvery > 0
            ? saveStateEvery
            : 0;
    const symPath = opts.sym
        ? path.resolve(opts.sym)
        : fs.existsSync(absInput.replace(/\.[^.]+$/, ".sym"))
            ? absInput.replace(/\.[^.]+$/, ".sym")
            : undefined;
    const symEntries = symPath ? (0, symbols_1.parseSymFile)(symPath) : [];
    const addrToNames = (0, symbols_1.buildAddrToNames)(symEntries);
    const smapPath = opts.smap
        ? path.resolve(opts.smap)
        : fs.existsSync(absInput.replace(/\.[^.]+$/, ".smap"))
            ? absInput.replace(/\.[^.]+$/, ".smap")
            : undefined;
    const smapEntries = smapPath ? (0, sourceMap_1.parseDbgSourceMap)(smapPath) : [];
    const addrToSource = (0, sourceMap_1.buildAddrToSourceEntry)(smapEntries);
    const core = new core_1.Z80DebugCore(!!opts.trace);
    if (opts.cpm) {
        core.setCpm22Enabled(true);
        core.setAllowOutOfImage(true);
        core.setCpmInteractive(!!opts.cpmInteractive);
        core.setCpmBdosTrace(!!opts.bdosTrace);
    }
    if (opts.cpmRoot) {
        core.setCpmRoot(path.resolve(opts.cpmRoot));
    }
    const session = new debugSession_1.Z80DebugSession(core, smapEntries);
    if (loadStatePath) {
        const runState = readRunState(loadStatePath);
        core.restoreSnapshot(runState.snapshot);
        console.log(`state  : restored from ${loadStatePath}`);
        console.log(`saved  : ${runState.savedAt}`);
        console.log(`source : ${runState.inputFile}`);
    }
    else {
        core.loadImage(data, base);
        if (opts.tail) {
            core.setCommandTail(opts.tail);
        }
        core.setEntry(entry);
    }
    if (opts.rpcStdio || opts.rpcListen) {
        if (opts.rpcStdio) {
            (0, rpcServer_1.startDebugRpcStdio)(session);
            return;
        }
        if (opts.rpcListen) {
            const { host, port } = parseListenAddress(opts.rpcListen);
            const server = (0, rpcServer_1.startDebugRpcTcp)(session, host, port);
            console.error(`[dbg-rpc] mode=tcp listen=${host}:${port}`);
            server.on("error", (e) => {
                console.error(`[dbg-rpc] error: ${e?.message ?? e}`);
            });
            return;
        }
    }
    console.log(`file   : ${absInput}`);
    console.log(`size   : ${data.length} bytes`);
    console.log(`base   : ${(0, core_1.formatHex)(base)}H`);
    console.log(`from   : ${(0, core_1.formatHex)(from)}H`);
    console.log(`sym    : ${symPath ?? "(none)"}`);
    console.log(`smap   : ${smapPath ?? "(none)"}`);
    if (saveStatePath)
        console.log(`save   : ${saveStatePath}`);
    if (loadStatePath)
        console.log(`load   : ${loadStatePath}`);
    if (opts.cmd) {
        console.log("");
        console.log("[Command]");
        (0, commandRunner_1.runCommandScript)(core, opts.cmd, addrToNames, addrToSource);
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
    printStaticDisasm(data, base, from, decodeCount, addrToNames, addrToSource);
    if (opts.cpm) {
        console.log("");
        console.log("[CP/M Run]");
        let lastSavedSteps = core.steps;
        const saveRunStateToDisk = (reason) => {
            if (!saveStatePath)
                return;
            const runState = {
                version: 1,
                inputFile: absInput,
                savedAt: new Date().toISOString(),
                reason,
                snapshot: core.createSnapshot(),
            };
            writeRunState(saveStatePath, runState);
            console.log(`[state] saved: ${saveStatePath} (${reason})`);
        };
        const result = core.run(maxSteps, {
            progressEvery: tickEvery,
            onProgress: tickEvery > 0
                ? ({ steps, remaining }) => {
                    if (progressEvery > 0) {
                        console.log(`[progress] steps=${steps} remaining=${remaining} pc=${(0, core_1.formatHex)(core.state.pc)}H sp=${(0, core_1.formatHex)(core.state.sp)}H`);
                    }
                    if (saveStatePath && saveStateEvery > 0 && steps - lastSavedSteps >= saveStateEvery) {
                        saveRunStateToDisk(`checkpoint@${steps}`);
                        lastSavedSteps = steps;
                    }
                }
                : undefined,
        });
        saveRunStateToDisk(result.reason ?? "stopped");
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
function readRunState(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !parsed.snapshot) {
        throw new Error(`Invalid state file: ${filePath}`);
    }
    return parsed;
}
function writeRunState(filePath, state) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const text = JSON.stringify(state);
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, text);
    try {
        fs.copyFileSync(tmpPath, filePath);
    }
    finally {
        try {
            fs.unlinkSync(tmpPath);
        }
        catch { /* ignore */ }
    }
}
function parseListenAddress(raw) {
    const s = String(raw).trim();
    const m = /^(.+):(\d+)$/.exec(s);
    if (m) {
        const host = m[1];
        const port = Number.parseInt(m[2], 10);
        if (!(port >= 1 && port <= 65535))
            throw new Error(`Invalid rpc listen port: ${raw}`);
        return { host, port };
    }
    const port = Number.parseInt(s, 10);
    if (!(port >= 1 && port <= 65535))
        throw new Error(`Invalid rpc listen: ${raw}`);
    return { host: "127.0.0.1", port };
}
