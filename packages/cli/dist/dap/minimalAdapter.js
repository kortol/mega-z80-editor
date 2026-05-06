"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinimalDapAdapter = void 0;
const rpcClient_1 = require("../debugger/rpcClient");
const disasm_1 = require("../debugger/disasm");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const MEMORY_ROOT_REF = 2;
const MEMORY_VIEW_REF_BASE = 0x1000;
function parseConsoleInputArg(raw) {
    const text = raw.trim();
    if (!text)
        return "";
    if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
        if (text.startsWith("\"")) {
            const parsed = JSON.parse(text);
            return typeof parsed === "string" ? parsed : String(parsed ?? "");
        }
        return text.slice(1, -1);
    }
    return text;
}
function normalizePath(p) {
    return String(p ?? "").replace(/\\/g, "/").toLowerCase();
}
function asObject(v) {
    return (v && typeof v === "object") ? v : {};
}
function asNumber(v, fallback) {
    return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
}
function formatFlagRegister(value) {
    const f = asNumber(value, 0) & 0xff;
    const flags = [
        { bit: 0x80, label: "S" },
        { bit: 0x40, label: "Z" },
        { bit: 0x20, label: "5" },
        { bit: 0x10, label: "H" },
        { bit: 0x08, label: "3" },
        { bit: 0x04, label: "P" },
        { bit: 0x02, label: "N" },
        { bit: 0x01, label: "C" },
    ]
        .map((flag) => ((f & flag.bit) !== 0 ? flag.label : "-"))
        .join("");
    return `${flags} (0x${f.toString(16).toUpperCase().padStart(2, "0")})`;
}
function formatRegisterValue(name, value) {
    if (/^f$/i.test(name)) {
        return formatFlagRegister(value);
    }
    const n = asNumber(value, 0);
    const width = /^(a|b|c|d|e|h|i|l|r)$/i.test(name) ? 2 : 4;
    const masked = width === 2 ? (n & 0xff) : (n & 0xffff);
    return `${masked} (0x${masked.toString(16).toUpperCase().padStart(width, "0")})`;
}
function formatHex(value, width) {
    return (value >>> 0).toString(16).toUpperCase().padStart(width, "0");
}
function toPrintableAscii(bytes) {
    return bytes
        .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "."))
        .join("");
}
function mapStopReason(kind) {
    if (kind === "breakpoint")
        return "breakpoint";
    if (kind === "step")
        return "step";
    if (kind === "pause")
        return "pause";
    if (kind === "exception")
        return "exception";
    if (kind === "halt" || kind === "targetExit")
        return "pause";
    return "pause";
}
class MinimalDapAdapter {
    seq = 1;
    client = new rpcClient_1.DebugRpcClient();
    bpsBySource = new Map();
    connected = false;
    connectAddr = "127.0.0.1:4700";
    sourceBaseDir = process.cwd();
    running = false;
    entryStoppedSent = false;
    initializedSent = false;
    pendingStartReq = null;
    targetProc = null;
    emittedTargetOutputLength = 0;
    carry = Buffer.alloc(0);
    debugLogEnabled = process.env.MZ80_DAP_LOG !== "0";
    start() {
        this.debugLog("adapter start");
        process.stdin.on("data", (chunk) => this.onData(chunk));
    }
    debugLog(message) {
        if (!this.debugLogEnabled)
            return;
        console.error(`[mz80-dap] ${message}`);
    }
    write(msg) {
        const text = JSON.stringify(msg);
        const head = `Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n`;
        process.stdout.write(head + text);
    }
    nextSeq() {
        return this.seq++;
    }
    sendResponse(req, success, body, message) {
        this.write({
            seq: this.nextSeq(),
            type: "response",
            request_seq: req.seq,
            success,
            command: req.command,
            body,
            message,
        });
    }
    sendEvent(event, body) {
        this.write({
            seq: this.nextSeq(),
            type: "event",
            event,
            body,
        });
    }
    onData(chunk) {
        this.carry = Buffer.concat([this.carry, chunk]);
        while (true) {
            const headerEnd = this.carry.indexOf("\r\n\r\n");
            if (headerEnd < 0)
                return;
            const header = this.carry.slice(0, headerEnd).toString("utf8");
            const m = /Content-Length:\s*(\d+)/i.exec(header);
            if (!m) {
                this.carry = this.carry.slice(headerEnd + 4);
                continue;
            }
            const len = Number.parseInt(m[1], 10);
            const bodyStart = headerEnd + 4;
            const bodyEnd = bodyStart + len;
            if (this.carry.length < bodyEnd)
                return;
            const body = this.carry.slice(bodyStart, bodyEnd).toString("utf8");
            this.carry = this.carry.slice(bodyEnd);
            let msg;
            try {
                msg = JSON.parse(body);
            }
            catch {
                continue;
            }
            if (msg.type === "request") {
                this.debugLog(`request ${msg.command}`);
                void this.handleRequest(msg);
            }
        }
    }
    async ensureConnected(addr) {
        if (addr)
            this.connectAddr = addr;
        if (this.connected)
            return;
        const deadline = Date.now() + 5000;
        let lastErr = null;
        while (Date.now() < deadline) {
            try {
                await this.client.connect(this.connectAddr);
                this.connected = true;
                return;
            }
            catch (e) {
                lastErr = e;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
        if (lastErr instanceof Error)
            throw lastErr;
        throw new Error(`Failed to connect: ${this.connectAddr}`);
    }
    async rpc(method, params) {
        const res = await this.client.request(method, params);
        if (res.error)
            throw new Error(`${res.error.code}: ${res.error.message}`);
        return res.result;
    }
    async startTargetIfNeeded(args) {
        if (this.targetProc)
            return;
        if (typeof args.program !== "string" || args.program.trim().length === 0)
            return;
        const program = String(args.program);
        const connect = typeof args.rpcListen === "string" && args.rpcListen.trim().length > 0
            ? String(args.rpcListen)
            : (typeof args.connect === "string" && args.connect.trim().length > 0
                ? String(args.connect)
                : this.connectAddr);
        const cliEntry = typeof args.cliEntry === "string" && args.cliEntry.trim().length > 0
            ? String(args.cliEntry)
            : path_1.default.resolve(__dirname, "..", "index.js");
        const spawnArgs = [cliEntry, "dbg", program, "--rpc-listen", connect];
        const sym = typeof args.sym === "string" && args.sym.trim().length > 0
            ? String(args.sym)
            : this.guessSidecarFile(program, ".sym");
        const smap = typeof args.smap === "string" && args.smap.trim().length > 0
            ? String(args.smap)
            : this.guessSidecarFile(program, ".smap");
        if (sym)
            spawnArgs.push("--sym", sym);
        if (smap)
            spawnArgs.push("--smap", smap);
        if (typeof args.base === "string" && args.base.trim().length > 0) {
            spawnArgs.push("--base", String(args.base));
        }
        if (args.cpm === true) {
            spawnArgs.push("--cpm");
        }
        if (args.cpmInteractive === true) {
            spawnArgs.push("--cpm-interactive");
        }
        const cwd = typeof args.cwd === "string" && args.cwd.trim().length > 0
            ? String(args.cwd)
            : process.cwd();
        this.sourceBaseDir = cwd;
        const runtimeCmd = "node";
        this.debugLog(`spawn target: ${runtimeCmd} ${spawnArgs.join(" ")}`);
        const proc = (0, child_process_1.spawn)(runtimeCmd, spawnArgs, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });
        this.targetProc = proc;
        proc.stderr.on("data", (chunk) => {
            this.sendEvent("output", { category: "stderr", output: chunk.toString("utf8") });
        });
        proc.stdout.on("data", (chunk) => {
            this.sendEvent("output", { category: "stdout", output: chunk.toString("utf8") });
        });
        proc.on("exit", (_code, _signal) => {
            this.debugLog(`target exited code=${String(_code)} signal=${String(_signal)}`);
            this.targetProc = null;
        });
        this.connectAddr = connect;
        await this.ensureConnected(connect);
    }
    guessSidecarFile(program, ext) {
        const dir = path_1.default.dirname(program);
        const base = path_1.default.basename(program).replace(/\.[^.]+$/, "");
        const candidate = path_1.default.join(dir, `${base}${ext}`);
        return fs_1.default.existsSync(candidate) ? candidate : undefined;
    }
    async sendEntryStoppedIfNeeded() {
        if (this.entryStoppedSent)
            return;
        await this.ensureConnected();
        this.entryStoppedSent = true;
        await this.emitTargetOutputIfAny();
        this.sendEvent("stopped", {
            reason: "entry",
            threadId: 1,
            allThreadsStopped: true,
            description: "Stopped at entry",
        });
    }
    toAbsoluteSourcePath(file) {
        if (!file)
            return file;
        if (path_1.default.isAbsolute(file))
            return path_1.default.normalize(file);
        return path_1.default.normalize(path_1.default.resolve(this.sourceBaseDir, file));
    }
    toResolveLocationCandidates(file) {
        const raw = String(file ?? "");
        if (!raw)
            return [];
        const out = [];
        const add = (p) => {
            const n = normalizePath(p);
            if (!n)
                return;
            if (!out.includes(n))
                out.push(n);
        };
        add(raw);
        const abs = path_1.default.isAbsolute(raw) ? path_1.default.normalize(raw) : path_1.default.resolve(this.sourceBaseDir, raw);
        add(abs);
        add(path_1.default.relative(this.sourceBaseDir, abs));
        return out;
    }
    async resolveLocationAddr(file, line) {
        const candidates = this.toResolveLocationCandidates(file);
        for (const fileCandidate of candidates) {
            const locRes = await this.rpc("resolveLocation", { file: fileCandidate, line });
            const addrs = Array.isArray(locRes) ? locRes : [];
            const addr = addrs.length > 0 && typeof addrs[0] === "number" ? addrs[0] : undefined;
            if (addr != null)
                return addr;
        }
        return undefined;
    }
    async resolveLocationNearest(file, line, maxDelta = 16) {
        const tried = new Set();
        const probe = async (candidateLine) => {
            if (candidateLine <= 0 || tried.has(candidateLine))
                return undefined;
            tried.add(candidateLine);
            const addr = await this.resolveLocationAddr(file, candidateLine);
            if (addr == null)
                return undefined;
            return { addr, line: candidateLine };
        };
        for (let d = 0; d <= maxDelta; d++) {
            const down = await probe(line + d);
            if (down)
                return down;
            if (d !== 0) {
                const up = await probe(line - d);
                if (up)
                    return up;
            }
        }
        return undefined;
    }
    stopTargetIfRunning() {
        if (!this.targetProc)
            return;
        try {
            this.targetProc.kill();
        }
        catch {
            // ignore shutdown errors
        }
        finally {
            this.targetProc = null;
        }
    }
    async getRegisters() {
        return asObject(await this.rpc("getRegisters"));
    }
    async getCallStack() {
        const stack = await this.rpc("getCallStack");
        return Array.isArray(stack) ? stack.map((frame) => asObject(frame)) : [];
    }
    async emitTargetOutputIfAny() {
        const output = String(await this.rpc("getOutput") ?? "");
        if (output.length <= this.emittedTargetOutputLength)
            return;
        const chunk = output.slice(this.emittedTargetOutputLength);
        this.emittedTargetOutputLength = output.length;
        if (!chunk)
            return;
        this.sendEvent("output", {
            category: "stdout",
            output: chunk,
        });
    }
    async queueConsoleInput(text, appendCr = false) {
        const res = asObject(await this.rpc("queueConsoleInput", { text, appendCr }));
        return asNumber(res.queued, 0);
    }
    async readMemory(addr, len) {
        const data = await this.rpc("readMemory", { addr, len });
        return Array.isArray(data) ? data.map((v) => asNumber(v, 0) & 0xff) : [];
    }
    async readWord(addr) {
        const data = await this.readMemory(addr, 2);
        const lo = data[0] ?? 0;
        const hi = data[1] ?? 0;
        return (lo | (hi << 8)) & 0xffff;
    }
    async runStepIn() {
        return asObject(await this.rpc("stepInstruction", { count: 1 }));
    }
    async runUntilCallDepth(targetDepth, maxSteps = 100000) {
        for (let i = 0; i < maxSteps; i++) {
            const stepped = await this.runStepIn();
            const stop = asObject(stepped.stop);
            const kind = String(stop.kind ?? "step");
            if (kind !== "step")
                return stepped;
            const depth = (await this.getCallStack()).length;
            if (depth <= targetDepth)
                return stepped;
        }
        return {
            stop: {
                kind: "exception",
                message: `step operation exceeded ${maxSteps} instructions`,
            },
        };
    }
    async runNext() {
        const baseDepth = (await this.getCallStack()).length;
        const before = await this.getRegisters();
        const pc = asNumber(before.pc, 0) & 0xffff;
        const bytes = await this.readMemory(pc, 4);
        const decoded = (0, disasm_1.decodeOne)(Uint8Array.from(bytes), 0, pc);
        const fallthrough = (pc + decoded.size) & 0xffff;
        const isCallLike = /^(CALL\b|RST\b)/i.test(decoded.text);
        if (!isCallLike) {
            return this.runStepIn();
        }
        const first = await this.runStepIn();
        const firstStop = asObject(first.stop);
        if (String(firstStop.kind ?? "step") !== "step")
            return first;
        const after = await this.getRegisters();
        const nextPc = asNumber(after.pc, 0) & 0xffff;
        const depth = (await this.getCallStack()).length;
        const callTaken = nextPc !== fallthrough && depth > baseDepth;
        if (!callTaken)
            return first;
        return this.runUntilCallDepth(baseDepth);
    }
    async runStepOut() {
        const baseDepth = (await this.getCallStack()).length;
        if (baseDepth <= 0) {
            return this.runStepIn();
        }
        return this.runUntilCallDepth(baseDepth - 1);
    }
    async buildStackFrames(startFrame, levels) {
        const frames = [];
        const regs = await this.getRegisters();
        const pc = asNumber(regs.pc, 0) & 0xffff;
        const callStack = await this.getCallStack();
        const currentResolved = asObject(await this.rpc("resolveAddress", { addr: pc }));
        frames.push(this.makeStackFrame(1, pc, currentResolved, `PC=${pc.toString(16).toUpperCase().padStart(4, "0")}H`));
        const wanted = Math.max(1, startFrame + levels);
        const callers = [...callStack].reverse();
        for (let i = 0; i < callers.length && i < wanted - 1; i++) {
            const frame = callers[i];
            const rawCallSite = asNumber(frame.callSite, -1);
            if (rawCallSite < 0)
                continue;
            const callSite = rawCallSite & 0xffff;
            const callerResolved = asObject(await this.rpc("resolveAddress", { addr: callSite }));
            const hasSource = typeof callerResolved.file === "string" && typeof callerResolved.line === "number";
            if (!hasSource)
                continue;
            frames.push(this.makeStackFrame(i + 2, callSite, callerResolved, `${String(frame.kind ?? "CALL")} ${callSite.toString(16).toUpperCase().padStart(4, "0")}H`));
        }
        return frames;
    }
    encodeMemoryViewRef(start, length) {
        return MEMORY_VIEW_REF_BASE + ((start & 0xffff) << 8) + (length & 0xff);
    }
    decodeMemoryViewRef(ref) {
        if (ref < MEMORY_VIEW_REF_BASE)
            return null;
        const raw = ref - MEMORY_VIEW_REF_BASE;
        const length = raw & 0xff;
        const start = (raw >> 8) & 0xffff;
        if (length <= 0)
            return null;
        return {
            start,
            length,
            label: `${formatHex(start, 4)}-${formatHex((start + length - 1) & 0xffff, 4)}`,
        };
    }
    makeMemoryViews(regs) {
        const pc = asNumber(regs.pc, 0) & 0xffff;
        const sp = asNumber(regs.sp, 0) & 0xffff;
        return [
            { label: `PC @${formatHex(pc, 4)}`, start: (pc - 0x10) & 0xffff, length: 0x40 },
            { label: `SP @${formatHex(sp, 4)}`, start: (sp - 0x10) & 0xffff, length: 0x40 },
            { label: "Zero Page", start: 0x0000, length: 0x100 },
            { label: "TPA Entry", start: 0x0100, length: 0x100 },
            { label: "DMA Buffer", start: 0x0080, length: 0x80 },
        ];
    }
    async buildMemoryRootVariables() {
        const regs = asObject(await this.rpc("getRegisters"));
        return this.makeMemoryViews(regs).map((view) => ({
            name: view.label,
            value: `${formatHex(view.start, 4)}-${formatHex((view.start + view.length - 1) & 0xffff, 4)}`,
            variablesReference: this.encodeMemoryViewRef(view.start, view.length),
        }));
    }
    async buildMemoryWindowVariables(view) {
        const data = await this.readMemory(view.start, view.length);
        const vars = [];
        for (let offset = 0; offset < data.length; offset += 16) {
            const row = data.slice(offset, offset + 16);
            const addr = (view.start + offset) & 0xffff;
            vars.push({
                name: formatHex(addr, 4),
                value: `${row.map((b) => formatHex(b, 2)).join(" ")}  ${toPrintableAscii(row)}`,
                variablesReference: 0,
            });
        }
        return vars;
    }
    makeStackFrame(id, addr, resolved, fallbackName) {
        const hasSource = typeof resolved.file === "string" && typeof resolved.line === "number";
        const frame = {
            id,
            name: fallbackName,
            line: hasSource ? asNumber(resolved.line, 1) : 1,
            column: hasSource ? asNumber(resolved.column, 1) : 1,
            instructionPointerReference: String(addr & 0xffff),
        };
        if (hasSource) {
            const sourcePath = this.toAbsoluteSourcePath(String(resolved.file));
            frame.name = `${path_1.default.basename(sourcePath)}:${asNumber(resolved.line, 1)}`;
            frame.source = {
                name: path_1.default.basename(sourcePath),
                path: sourcePath,
            };
        }
        return frame;
    }
    async sendStoppedFromResult(req, result, fallbackReason = "step") {
        const stop = asObject(result.stop);
        let kind = String(stop.kind ?? fallbackReason);
        if (fallbackReason === "step" && kind === "breakpoint" && !stop.breakpointId) {
            kind = "step";
        }
        this.sendResponse(req, true);
        await this.emitTargetOutputIfAny();
        this.sendEvent("stopped", {
            reason: mapStopReason(kind),
            threadId: 1,
            allThreadsStopped: true,
            description: stop.message ?? kind,
        });
    }
    async handleRequest(req) {
        try {
            switch (req.command) {
                case "initialize": {
                    this.sendResponse(req, true, {
                        supportsConfigurationDoneRequest: true,
                        supportsEvaluateForHovers: true,
                        supportsSetVariable: false,
                    });
                    return;
                }
                case "launch":
                case "attach": {
                    const args = asObject(req.arguments);
                    this.emittedTargetOutputLength = 0;
                    if (typeof args.cwd === "string" && args.cwd.trim().length > 0) {
                        this.sourceBaseDir = String(args.cwd);
                    }
                    const connect = typeof args.connect === "string" && args.connect.trim().length > 0
                        ? args.connect
                        : (typeof args.rpcListen === "string" && args.rpcListen.trim().length > 0
                            ? args.rpcListen
                            : this.connectAddr);
                    if (req.command === "launch") {
                        await this.startTargetIfNeeded(args);
                    }
                    await this.ensureConnected(connect);
                    this.pendingStartReq = req;
                    if (!this.initializedSent) {
                        this.initializedSent = true;
                        this.sendEvent("initialized");
                    }
                    return;
                }
                case "configurationDone": {
                    this.sendResponse(req, true);
                    if (this.pendingStartReq) {
                        this.sendResponse(this.pendingStartReq, true);
                        this.pendingStartReq = null;
                        await this.sendEntryStoppedIfNeeded();
                    }
                    return;
                }
                case "setBreakpoints": {
                    await this.ensureConnected();
                    const args = asObject(req.arguments);
                    const source = asObject(args.source);
                    const sourcePath = normalizePath(String(source.path ?? ""));
                    const requestedLines = (Array.isArray(args.breakpoints) ? args.breakpoints : [])
                        .map((x) => asObject(x))
                        .map((b) => asNumber(b.line, 0));
                    this.debugLog(`setBreakpoints source=${sourcePath} lines=${requestedLines.join(",")}`);
                    this.sendEvent("output", {
                        category: "console",
                        output: `[dap] setBreakpoints source=${sourcePath} lines=${requestedLines.join(",")}\n`,
                    });
                    const old = this.bpsBySource.get(sourcePath) ?? [];
                    for (const b of old) {
                        await this.rpc("removeBreakpoint", { id: b.id });
                    }
                    const requested = (Array.isArray(args.breakpoints) ? args.breakpoints : [])
                        .map((x) => asObject(x));
                    const next = [];
                    const out = [];
                    for (const b of requested) {
                        const line = asNumber(b.line, 0);
                        if (!sourcePath || line <= 0) {
                            out.push({ verified: false, line, message: "invalid source path or line" });
                            continue;
                        }
                        const resolved = await this.resolveLocationNearest(sourcePath, line);
                        if (!resolved) {
                            out.push({
                                verified: false,
                                line,
                                message: "source location unresolved (smap may be missing)",
                            });
                            this.sendEvent("output", {
                                category: "stderr",
                                output: `[dap] unresolved breakpoint: ${sourcePath}:${line} (smap missing or no mapped instruction nearby)\n`,
                            });
                            continue;
                        }
                        const addr = resolved.addr;
                        const added = await this.rpc("addBreakpoint", { kind: "exec", addr, enabled: true });
                        const id = String(added?.id ?? "");
                        if (!id) {
                            out.push({ verified: false, line });
                            continue;
                        }
                        next.push({ id, addr, line: resolved.line });
                        out.push({ verified: true, id, line: resolved.line });
                    }
                    this.bpsBySource.set(sourcePath, next);
                    const resolvedLines = out.map((b) => String(b.line ?? "?")).join(",");
                    this.debugLog(`setBreakpoints resolved=${resolvedLines}`);
                    this.sendEvent("output", {
                        category: "console",
                        output: `[dap] setBreakpoints resolved=${resolvedLines}\n`,
                    });
                    this.sendResponse(req, true, { breakpoints: out });
                    return;
                }
                case "threads": {
                    this.sendResponse(req, true, { threads: [{ id: 1, name: "Z80" }] });
                    return;
                }
                case "stackTrace": {
                    await this.ensureConnected();
                    const args = asObject(req.arguments);
                    const startFrame = Math.max(0, asNumber(args.startFrame, 0));
                    const levels = Math.max(1, asNumber(args.levels, 20));
                    const frames = await this.buildStackFrames(startFrame, levels);
                    this.sendResponse(req, true, {
                        stackFrames: frames.slice(startFrame, startFrame + levels),
                        totalFrames: frames.length,
                    });
                    return;
                }
                case "scopes": {
                    this.sendResponse(req, true, {
                        scopes: [
                            { name: "Registers", variablesReference: 1, expensive: false },
                            { name: "Memory", variablesReference: 2, expensive: true },
                        ],
                    });
                    return;
                }
                case "variables": {
                    await this.ensureConnected();
                    const args = asObject(req.arguments);
                    const ref = asNumber(args.variablesReference, 0);
                    if (ref === 1) {
                        const regs = asObject(await this.rpc("getRegisters"));
                        const vars = Object.keys(regs).sort().map((k) => ({
                            name: k,
                            value: formatRegisterValue(k, regs[k]),
                            variablesReference: 0,
                        }));
                        this.sendResponse(req, true, { variables: vars });
                        return;
                    }
                    if (ref === MEMORY_ROOT_REF) {
                        this.sendResponse(req, true, {
                            variables: await this.buildMemoryRootVariables(),
                        });
                        return;
                    }
                    const memoryView = this.decodeMemoryViewRef(ref);
                    if (memoryView) {
                        this.sendResponse(req, true, {
                            variables: await this.buildMemoryWindowVariables(memoryView),
                        });
                        return;
                    }
                    this.sendResponse(req, true, { variables: [] });
                    return;
                }
                case "evaluate": {
                    await this.ensureConnected();
                    const args = asObject(req.arguments);
                    const expr = String(args.expression ?? "").trim();
                    const inputMatch = /^(input|type|key)\s+([\s\S]+)$/i.exec(expr);
                    if (inputMatch) {
                        const mode = inputMatch[1].toLowerCase();
                        const text = parseConsoleInputArg(inputMatch[2]);
                        const queued = await this.queueConsoleInput(text, mode !== "key");
                        this.sendResponse(req, true, {
                            result: `queued ${queued} byte(s)`,
                            variablesReference: 0,
                        });
                        return;
                    }
                    const m = /^mem\[(.+),(.+)\]$/i.exec(expr);
                    if (m) {
                        const addr = Number(m[1]);
                        const len = Number(m[2]);
                        const data = await this.rpc("readMemory", { addr, len });
                        this.sendResponse(req, true, { result: JSON.stringify(data), variablesReference: 0 });
                        return;
                    }
                    const regs = asObject(await this.rpc("getRegisters"));
                    if (Object.prototype.hasOwnProperty.call(regs, expr)) {
                        this.sendResponse(req, true, { result: String(regs[expr]), variablesReference: 0 });
                        return;
                    }
                    this.sendResponse(req, true, { result: "N/A", variablesReference: 0 });
                    return;
                }
                case "continue": {
                    await this.ensureConnected();
                    this.sendResponse(req, true, { allThreadsContinued: true });
                    if (this.running)
                        return;
                    this.running = true;
                    void (async () => {
                        try {
                            const result = asObject(await this.rpc("run", { maxSteps: 100000000 }));
                            const stop = asObject(result.stop);
                            const kind = String(stop.kind ?? "pause");
                            if (kind === "targetExit") {
                                this.debugLog("stopped reason=targetExit");
                                await this.emitTargetOutputIfAny();
                                this.sendEvent("terminated");
                            }
                            else {
                                this.debugLog(`stopped reason=${kind}`);
                                await this.emitTargetOutputIfAny();
                                this.sendEvent("stopped", {
                                    reason: mapStopReason(kind),
                                    threadId: 1,
                                    allThreadsStopped: true,
                                    description: stop.message ?? kind,
                                });
                            }
                        }
                        catch (e) {
                            const msg = e instanceof Error ? e.message : String(e);
                            this.sendEvent("output", { category: "stderr", output: `${msg}\n` });
                            this.sendEvent("stopped", { reason: "exception", threadId: 1, allThreadsStopped: true, text: msg });
                        }
                        finally {
                            this.running = false;
                        }
                    })();
                    return;
                }
                case "stepIn": {
                    await this.ensureConnected();
                    await this.sendStoppedFromResult(req, await this.runStepIn());
                    return;
                }
                case "next": {
                    await this.ensureConnected();
                    await this.sendStoppedFromResult(req, await this.runNext());
                    return;
                }
                case "stepOut": {
                    await this.ensureConnected();
                    await this.sendStoppedFromResult(req, await this.runStepOut());
                    return;
                }
                case "pause": {
                    await this.ensureConnected();
                    await this.rpc("pause");
                    this.sendResponse(req, true);
                    this.sendEvent("stopped", { reason: "pause", threadId: 1, allThreadsStopped: true });
                    return;
                }
                case "disconnect":
                case "terminate": {
                    if (this.connected) {
                        try {
                            await this.rpc("quit");
                        }
                        catch { /* ignore */ }
                    }
                    this.client.close();
                    this.connected = false;
                    this.entryStoppedSent = false;
                    this.initializedSent = false;
                    this.pendingStartReq = null;
                    this.emittedTargetOutputLength = 0;
                    this.stopTargetIfRunning();
                    this.sendResponse(req, true);
                    this.sendEvent("terminated");
                    return;
                }
                default:
                    this.sendResponse(req, false, undefined, `Unsupported request: ${req.command}`);
                    return;
            }
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.sendResponse(req, false, undefined, msg);
        }
    }
}
exports.MinimalDapAdapter = MinimalDapAdapter;
