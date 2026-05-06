import { DebugRpcClient } from "../debugger/rpcClient";
import { decodeOne } from "../debugger/disasm";
import path from "path";
import { ChildProcessByStdio, spawn } from "child_process";
import { Readable } from "stream";
import fs from "fs";

type DapProtocolMessage = {
  seq: number;
  type: "request" | "response" | "event";
};

type DapRequest = DapProtocolMessage & {
  type: "request";
  command: string;
  arguments?: Record<string, unknown>;
};

type DapResponse = DapProtocolMessage & {
  type: "response";
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: unknown;
};

type DapEvent = DapProtocolMessage & {
  type: "event";
  event: string;
  body?: unknown;
};

type PendingBp = { id: string; addr: number; line: number };
type DebugCallFrame = {
  callSite?: number;
  entry?: number;
  returnAddr?: number;
  kind?: string;
};

type MemoryView = {
  start: number;
  length: number;
  label: string;
};

const MEMORY_ROOT_REF = 2;
const MEMORY_VIEW_REF_BASE = 0x1000;

function parseConsoleInputArg(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    if (text.startsWith("\"")) {
      const parsed = JSON.parse(text);
      return typeof parsed === "string" ? parsed : String(parsed ?? "");
    }
    return text.slice(1, -1);
  }
  return text;
}

function normalizePath(p: string): string {
  return String(p ?? "").replace(/\\/g, "/").toLowerCase();
}

function asObject(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object") ? (v as Record<string, unknown>) : {};
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function formatFlagRegister(value: unknown): string {
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

function formatRegisterValue(name: string, value: unknown): string {
  if (/^f$/i.test(name)) {
    return formatFlagRegister(value);
  }
  const n = asNumber(value, 0);
  const width = /^(a|b|c|d|e|h|i|l|r)$/i.test(name) ? 2 : 4;
  const masked = width === 2 ? (n & 0xff) : (n & 0xffff);
  return `${masked} (0x${masked.toString(16).toUpperCase().padStart(width, "0")})`;
}

function formatHex(value: number, width: number): string {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, "0");
}

function toPrintableAscii(bytes: number[]): string {
  return bytes
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "."))
    .join("");
}

function mapStopReason(kind: string): string {
  if (kind === "breakpoint") return "breakpoint";
  if (kind === "step") return "step";
  if (kind === "pause") return "pause";
  if (kind === "exception") return "exception";
  if (kind === "halt" || kind === "targetExit") return "pause";
  return "pause";
}

export class MinimalDapAdapter {
  private seq = 1;
  private readonly client = new DebugRpcClient();
  private readonly bpsBySource = new Map<string, PendingBp[]>();
  private connected = false;
  private connectAddr = "127.0.0.1:4700";
  private sourceBaseDir = process.cwd();
  private running = false;
  private entryStoppedSent = false;
  private initializedSent = false;
  private pendingStartReq: DapRequest | null = null;
  private targetProc: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private emittedTargetOutputLength = 0;

  private carry = Buffer.alloc(0);
  private readonly debugLogEnabled = process.env.MZ80_DAP_LOG !== "0";

  start(): void {
    this.debugLog("adapter start");
    process.stdin.on("data", (chunk: Buffer) => this.onData(chunk));
  }

  private debugLog(message: string): void {
    if (!this.debugLogEnabled) return;
    console.error(`[mz80-dap] ${message}`);
  }

  private write(msg: DapResponse | DapEvent): void {
    const text = JSON.stringify(msg);
    const head = `Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n`;
    process.stdout.write(head + text);
  }

  private nextSeq(): number {
    return this.seq++;
  }

  private sendResponse(req: DapRequest, success: boolean, body?: unknown, message?: string): void {
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

  private sendEvent(event: string, body?: unknown): void {
    this.write({
      seq: this.nextSeq(),
      type: "event",
      event,
      body,
    });
  }

  private onData(chunk: Buffer): void {
    this.carry = Buffer.concat([this.carry, chunk]);
    while (true) {
      const headerEnd = this.carry.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = this.carry.slice(0, headerEnd).toString("utf8");
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) {
        this.carry = this.carry.slice(headerEnd + 4);
        continue;
      }
      const len = Number.parseInt(m[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + len;
      if (this.carry.length < bodyEnd) return;
      const body = this.carry.slice(bodyStart, bodyEnd).toString("utf8");
      this.carry = this.carry.slice(bodyEnd);
      let msg: DapRequest;
      try {
        msg = JSON.parse(body) as DapRequest;
      } catch {
        continue;
      }
      if (msg.type === "request") {
        this.debugLog(`request ${msg.command}`);
        void this.handleRequest(msg);
      }
    }
  }

  private async ensureConnected(addr?: string): Promise<void> {
    if (addr) this.connectAddr = addr;
    if (this.connected) return;
    const deadline = Date.now() + 5000;
    let lastErr: unknown = null;
    while (Date.now() < deadline) {
      try {
        await this.client.connect(this.connectAddr);
        this.connected = true;
        return;
      } catch (e: unknown) {
        lastErr = e;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (lastErr instanceof Error) throw lastErr;
    throw new Error(`Failed to connect: ${this.connectAddr}`);
  }

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const res = await this.client.request(method, params);
    if (res.error) throw new Error(`${res.error.code}: ${res.error.message}`);
    return res.result;
  }

  private async startTargetIfNeeded(args: Record<string, unknown>): Promise<void> {
    if (this.targetProc) return;
    if (typeof args.program !== "string" || args.program.trim().length === 0) return;

    const program = String(args.program);
    const connect = typeof args.rpcListen === "string" && args.rpcListen.trim().length > 0
      ? String(args.rpcListen)
      : (typeof args.connect === "string" && args.connect.trim().length > 0
        ? String(args.connect)
        : this.connectAddr);

    const cliEntry = typeof args.cliEntry === "string" && args.cliEntry.trim().length > 0
      ? String(args.cliEntry)
      : path.resolve(__dirname, "..", "index.js");

    const spawnArgs = [cliEntry, "dbg", program, "--rpc-listen", connect];
    const sym = typeof args.sym === "string" && args.sym.trim().length > 0
      ? String(args.sym)
      : this.guessSidecarFile(program, ".sym");
    const smap = typeof args.smap === "string" && args.smap.trim().length > 0
      ? String(args.smap)
      : this.guessSidecarFile(program, ".smap");
    if (sym) spawnArgs.push("--sym", sym);
    if (smap) spawnArgs.push("--smap", smap);
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
    const proc = spawn(runtimeCmd, spawnArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.targetProc = proc;

    proc.stderr.on("data", (chunk: Buffer) => {
      this.sendEvent("output", { category: "stderr", output: chunk.toString("utf8") });
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      this.sendEvent("output", { category: "stdout", output: chunk.toString("utf8") });
    });

    proc.on("exit", (_code, _signal) => {
      this.debugLog(`target exited code=${String(_code)} signal=${String(_signal)}`);
      this.targetProc = null;
    });

    this.connectAddr = connect;
    await this.ensureConnected(connect);
  }

  private guessSidecarFile(program: string, ext: ".sym" | ".smap"): string | undefined {
    const dir = path.dirname(program);
    const base = path.basename(program).replace(/\.[^.]+$/, "");
    const candidate = path.join(dir, `${base}${ext}`);
    return fs.existsSync(candidate) ? candidate : undefined;
  }

  private async sendEntryStoppedIfNeeded(): Promise<void> {
    if (this.entryStoppedSent) return;
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

  private toAbsoluteSourcePath(file: string): string {
    if (!file) return file;
    if (path.isAbsolute(file)) return path.normalize(file);
    return path.normalize(path.resolve(this.sourceBaseDir, file));
  }

  private toResolveLocationCandidates(file: string): string[] {
    const raw = String(file ?? "");
    if (!raw) return [];
    const out: string[] = [];
    const add = (p: string) => {
      const n = normalizePath(p);
      if (!n) return;
      if (!out.includes(n)) out.push(n);
    };
    add(raw);
    const abs = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(this.sourceBaseDir, raw);
    add(abs);
    add(path.relative(this.sourceBaseDir, abs));
    return out;
  }

  private async resolveLocationAddr(file: string, line: number): Promise<number | undefined> {
    const candidates = this.toResolveLocationCandidates(file);
    for (const fileCandidate of candidates) {
      const locRes = await this.rpc("resolveLocation", { file: fileCandidate, line }) as unknown;
      const addrs = Array.isArray(locRes) ? locRes : [];
      const addr = addrs.length > 0 && typeof addrs[0] === "number" ? (addrs[0] as number) : undefined;
      if (addr != null) return addr;
    }
    return undefined;
  }

  private async resolveLocationNearest(
    file: string,
    line: number,
    maxDelta = 16
  ): Promise<{ addr: number; line: number } | undefined> {
    const tried = new Set<number>();
    const probe = async (candidateLine: number): Promise<{ addr: number; line: number } | undefined> => {
      if (candidateLine <= 0 || tried.has(candidateLine)) return undefined;
      tried.add(candidateLine);
      const addr = await this.resolveLocationAddr(file, candidateLine);
      if (addr == null) return undefined;
      return { addr, line: candidateLine };
    };

    for (let d = 0; d <= maxDelta; d++) {
      const down = await probe(line + d);
      if (down) return down;
      if (d !== 0) {
        const up = await probe(line - d);
        if (up) return up;
      }
    }
    return undefined;
  }

  private stopTargetIfRunning(): void {
    if (!this.targetProc) return;
    try {
      this.targetProc.kill();
    } catch {
      // ignore shutdown errors
    } finally {
      this.targetProc = null;
    }
  }

  private async getRegisters(): Promise<Record<string, unknown>> {
    return asObject(await this.rpc("getRegisters"));
  }

  private async getCallStack(): Promise<DebugCallFrame[]> {
    const stack = await this.rpc("getCallStack");
    return Array.isArray(stack) ? stack.map((frame) => asObject(frame) as DebugCallFrame) : [];
  }

  private async emitTargetOutputIfAny(): Promise<void> {
    const output = String(await this.rpc("getOutput") ?? "");
    if (output.length <= this.emittedTargetOutputLength) return;
    const chunk = output.slice(this.emittedTargetOutputLength);
    this.emittedTargetOutputLength = output.length;
    if (!chunk) return;
    this.sendEvent("output", {
      category: "stdout",
      output: chunk,
    });
  }

  private async queueConsoleInput(text: string, appendCr = false): Promise<number> {
    const res = asObject(await this.rpc("queueConsoleInput", { text, appendCr }));
    return asNumber(res.queued, 0);
  }

  private async readMemory(addr: number, len: number): Promise<number[]> {
    const data = await this.rpc("readMemory", { addr, len });
    return Array.isArray(data) ? data.map((v) => asNumber(v, 0) & 0xff) : [];
  }

  private async readWord(addr: number): Promise<number> {
    const data = await this.readMemory(addr, 2);
    const lo = data[0] ?? 0;
    const hi = data[1] ?? 0;
    return (lo | (hi << 8)) & 0xffff;
  }

  private async runStepIn(): Promise<Record<string, unknown>> {
    return asObject(await this.rpc("stepInstruction", { count: 1 }));
  }

  private async runUntilCallDepth(targetDepth: number, maxSteps = 100000): Promise<Record<string, unknown>> {
    for (let i = 0; i < maxSteps; i++) {
      const stepped = await this.runStepIn();
      const stop = asObject(stepped.stop);
      const kind = String(stop.kind ?? "step");
      if (kind !== "step") return stepped;
      const depth = (await this.getCallStack()).length;
      if (depth <= targetDepth) return stepped;
    }
    return {
      stop: {
        kind: "exception",
        message: `step operation exceeded ${maxSteps} instructions`,
      },
    };
  }

  private async runNext(): Promise<Record<string, unknown>> {
    const baseDepth = (await this.getCallStack()).length;
    const before = await this.getRegisters();
    const pc = asNumber(before.pc, 0) & 0xffff;
    const bytes = await this.readMemory(pc, 4);
    const decoded = decodeOne(Uint8Array.from(bytes), 0, pc);
    const fallthrough = (pc + decoded.size) & 0xffff;
    const isCallLike = /^(CALL\b|RST\b)/i.test(decoded.text);
    if (!isCallLike) {
      return this.runStepIn();
    }

    const first = await this.runStepIn();
    const firstStop = asObject(first.stop);
    if (String(firstStop.kind ?? "step") !== "step") return first;

    const after = await this.getRegisters();
    const nextPc = asNumber(after.pc, 0) & 0xffff;
    const depth = (await this.getCallStack()).length;
    const callTaken = nextPc !== fallthrough && depth > baseDepth;
    if (!callTaken) return first;

    return this.runUntilCallDepth(baseDepth);
  }

  private async runStepOut(): Promise<Record<string, unknown>> {
    const baseDepth = (await this.getCallStack()).length;
    if (baseDepth <= 0) {
      return this.runStepIn();
    }
    return this.runUntilCallDepth(baseDepth - 1);
  }

  private async buildStackFrames(startFrame: number, levels: number): Promise<Array<Record<string, unknown>>> {
    const frames: Array<Record<string, unknown>> = [];
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
      if (rawCallSite < 0) continue;
      const callSite = rawCallSite & 0xffff;
      const callerResolved = asObject(await this.rpc("resolveAddress", { addr: callSite }));
      const hasSource = typeof callerResolved.file === "string" && typeof callerResolved.line === "number";
      if (!hasSource) continue;
      frames.push(this.makeStackFrame(
        i + 2,
        callSite,
        callerResolved,
        `${String(frame.kind ?? "CALL")} ${callSite.toString(16).toUpperCase().padStart(4, "0")}H`
      ));
    }
    return frames;
  }

  private encodeMemoryViewRef(start: number, length: number): number {
    return MEMORY_VIEW_REF_BASE + ((start & 0xffff) << 8) + (length & 0xff);
  }

  private decodeMemoryViewRef(ref: number): MemoryView | null {
    if (ref < MEMORY_VIEW_REF_BASE) return null;
    const raw = ref - MEMORY_VIEW_REF_BASE;
    const length = raw & 0xff;
    const start = (raw >> 8) & 0xffff;
    if (length <= 0) return null;
    return {
      start,
      length,
      label: `${formatHex(start, 4)}-${formatHex((start + length - 1) & 0xffff, 4)}`,
    };
  }

  private makeMemoryViews(regs: Record<string, unknown>): MemoryView[] {
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

  private async buildMemoryRootVariables(): Promise<Array<Record<string, unknown>>> {
    const regs = asObject(await this.rpc("getRegisters"));
    return this.makeMemoryViews(regs).map((view) => ({
      name: view.label,
      value: `${formatHex(view.start, 4)}-${formatHex((view.start + view.length - 1) & 0xffff, 4)}`,
      variablesReference: this.encodeMemoryViewRef(view.start, view.length),
    }));
  }

  private async buildMemoryWindowVariables(view: MemoryView): Promise<Array<Record<string, unknown>>> {
    const data = await this.readMemory(view.start, view.length);
    const vars: Array<Record<string, unknown>> = [];
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

  private makeStackFrame(
    id: number,
    addr: number,
    resolved: Record<string, unknown>,
    fallbackName: string
  ): Record<string, unknown> {
    const hasSource = typeof resolved.file === "string" && typeof resolved.line === "number";
    const frame: Record<string, unknown> = {
      id,
      name: fallbackName,
      line: hasSource ? asNumber(resolved.line, 1) : 1,
      column: hasSource ? asNumber(resolved.column, 1) : 1,
      instructionPointerReference: String(addr & 0xffff),
    };
    if (hasSource) {
      const sourcePath = this.toAbsoluteSourcePath(String(resolved.file));
      frame.name = `${path.basename(sourcePath)}:${asNumber(resolved.line, 1)}`;
      frame.source = {
        name: path.basename(sourcePath),
        path: sourcePath,
      };
    }
    return frame;
  }

  private async sendStoppedFromResult(req: DapRequest, result: Record<string, unknown>, fallbackReason = "step"): Promise<void> {
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

  private async handleRequest(req: DapRequest): Promise<void> {
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
          const next: PendingBp[] = [];
          const out: Array<Record<string, unknown>> = [];
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
            const added = await this.rpc("addBreakpoint", { kind: "exec", addr, enabled: true }) as Record<string, unknown>;
            const id = String(added?.id ?? "");
            if (!id) {
              out.push({ verified: false, line });
              continue;
            }
            next.push({ id, addr, line: resolved.line });
            out.push({ verified: true, id, line: resolved.line });
          }
          this.bpsBySource.set(sourcePath, next);
          const resolvedLines = out.map((b) => String((b as Record<string, unknown>).line ?? "?")).join(",");
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
          if (this.running) return;
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
              } else {
                this.debugLog(`stopped reason=${kind}`);
                await this.emitTargetOutputIfAny();
                this.sendEvent("stopped", {
                  reason: mapStopReason(kind),
                  threadId: 1,
                  allThreadsStopped: true,
                  description: stop.message ?? kind,
                });
              }
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              this.sendEvent("output", { category: "stderr", output: `${msg}\n` });
              this.sendEvent("stopped", { reason: "exception", threadId: 1, allThreadsStopped: true, text: msg });
            } finally {
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
            try { await this.rpc("quit"); } catch { /* ignore */ }
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.sendResponse(req, false, undefined, msg);
    }
  }
}
