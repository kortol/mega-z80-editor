import * as fs from "fs";
import * as path from "path";
import { buildAddrToNames, parseSymFile } from "./symbols";
import { decodeOne } from "./disasm";
import { formatHex, parseNum, Z80CoreSnapshot, Z80DebugCore } from "./core";
import { Z80DebugSession } from "./debugSession";
import { printDisasm, printHexDump, runCommandScript } from "./commandRunner";
import { startDebugRpcStdio, startDebugRpcTcp } from "./rpcServer";
import { SourceMapEntry } from "../sourcemap/model";
import { buildAddrToSourceEntry, parseDbgSourceMap } from "./sourceMap";

function printStaticDisasm(
  buf: Uint8Array,
  base: number,
  from: number,
  count: number,
  addrToNames: Map<number, string[]>,
  addrToSource?: Map<number, SourceMapEntry>
): void {
  let off = Math.max(0, from - base);
  let n = 0;
  while (off < buf.length && n < count) {
    const addr = base + off;
    const names = addrToNames.get(addr);
    if (names && names.length > 0) console.log(`${names.join(", ")}:`);
    const d = decodeOne(buf, off, addr);
    const bytes = Array.from(buf.slice(off, Math.min(buf.length, off + d.size)))
      .map((b) => formatHex(b, 2))
      .join(" ");
    const targetNames = d.target != null ? addrToNames.get(d.target) : undefined;
    const note = targetNames && targetNames.length > 0 ? ` ; -> ${targetNames.join(", ")}` : "";
    const src = addrToSource?.get(addr);
    const srcNote = src ? ` ; ${src.file}:${src.line}` : "";
    console.log(`  ${formatHex(addr)}  ${bytes.padEnd(12)}  ${d.text}${note}${srcNote}`);
    off += d.size;
    n++;
  }
}

export function dbgBinary(
  inputFile: string,
  opts: {
    sym?: string;
    base?: string;
    from?: string;
    bytes?: string;
    decode?: string;
    cpm?: boolean;
    cpmInteractive?: boolean;
    steps?: string;
    progressEvery?: string;
    saveState?: string;
    loadState?: string;
    saveStateEvery?: string;
    entry?: string;
    trace?: boolean;
    bdosTrace?: boolean;
    cmd?: string;
    cpmRoot?: string;
    tail?: string;
    smap?: string;
    rpcStdio?: boolean;
    rpcListen?: string;
  }
) {
  const absInput = path.resolve(inputFile);
  if (!opts.loadState && !fs.existsSync(absInput)) {
    throw new Error(`Input file not found: ${absInput}`);
  }
  const data = fs.existsSync(absInput) ? fs.readFileSync(absInput) : Buffer.alloc(0);
  const defaultBase = /\.com$/i.test(absInput) ? 0x100 : 0;
  const base = opts.base ? parseNum(opts.base) : defaultBase;
  const from = opts.from ? parseNum(opts.from) : base;
  const bytes = opts.bytes ? parseNum(opts.bytes) : 0x80;
  const decodeCount = opts.decode ? parseNum(opts.decode) : 24;
  const entry = opts.entry ? parseNum(opts.entry) : 0x0100;
  const maxSteps = opts.steps ? parseNum(opts.steps) : 200000;
  const progressEvery = opts.progressEvery ? parseNum(opts.progressEvery) : 0;
  const saveStatePath = opts.saveState ? path.resolve(opts.saveState) : undefined;
  const loadStatePath = opts.loadState ? path.resolve(opts.loadState) : undefined;
  const saveStateEvery = opts.saveStateEvery ? parseNum(opts.saveStateEvery) : 0;
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
  const symEntries = symPath ? parseSymFile(symPath) : [];
  const addrToNames = buildAddrToNames(symEntries);
  const smapPath = opts.smap
    ? path.resolve(opts.smap)
    : fs.existsSync(absInput.replace(/\.[^.]+$/, ".smap"))
      ? absInput.replace(/\.[^.]+$/, ".smap")
      : undefined;
  const smapEntries = smapPath ? parseDbgSourceMap(smapPath) : [];
  const addrToSource = buildAddrToSourceEntry(smapEntries);

  const core = new Z80DebugCore(!!opts.trace);
  if (opts.cpm) {
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.setCpmInteractive(!!opts.cpmInteractive);
    core.setCpmBdosTrace(!!opts.bdosTrace);
  }
  if (opts.cpmRoot) {
    core.setCpmRoot(path.resolve(opts.cpmRoot));
  }
  const session = new Z80DebugSession(core, smapEntries);

  if (loadStatePath) {
    const runState = readRunState(loadStatePath);
    core.restoreSnapshot(runState.snapshot);
    console.log(`state  : restored from ${loadStatePath}`);
    console.log(`saved  : ${runState.savedAt}`);
    console.log(`source : ${runState.inputFile}`);
  } else {
    core.loadImage(data, base);
    if (opts.tail) {
      core.setCommandTail(opts.tail);
    }
    core.setEntry(entry);
  }

  if (opts.rpcStdio || opts.rpcListen) {
    if (opts.rpcStdio) {
      startDebugRpcStdio(session);
      return;
    }
    if (opts.rpcListen) {
      const { host, port } = parseListenAddress(opts.rpcListen);
      const server = startDebugRpcTcp(session, host, port);
      console.error(`[dbg-rpc] mode=tcp listen=${host}:${port}`);
      server.on("error", (e: any) => {
        console.error(`[dbg-rpc] error: ${e?.message ?? e}`);
      });
      return;
    }
  }

  console.log(`file   : ${absInput}`);
  console.log(`size   : ${data.length} bytes`);
  console.log(`base   : ${formatHex(base)}H`);
  console.log(`from   : ${formatHex(from)}H`);
  console.log(`sym    : ${symPath ?? "(none)"}`);
  console.log(`smap   : ${smapPath ?? "(none)"}`);
  if (saveStatePath) console.log(`save   : ${saveStatePath}`);
  if (loadStatePath) console.log(`load   : ${loadStatePath}`);

  if (opts.cmd) {
    console.log("");
    console.log("[Command]");
    runCommandScript(core, opts.cmd, addrToNames, addrToSource);
    const out = core.getOutput();
    if (out.length > 0) {
      console.log("[BDOS Output]");
      process.stdout.write(out);
      if (!out.endsWith("\n")) process.stdout.write("\n");
    }
    return;
  }

  console.log("");
  console.log("[HexDump]");
  printHexDump(core.mem, from, bytes);
  console.log("");
  console.log("[Decode]");
  printStaticDisasm(data, base, from, decodeCount, addrToNames, addrToSource);

  if (opts.cpm) {
    console.log("");
    console.log("[CP/M Run]");
    let lastSavedSteps = core.steps;
    const saveRunStateToDisk = (reason: string) => {
      if (!saveStatePath) return;
      const runState: DebugRunState = {
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
            console.log(`[progress] steps=${steps} remaining=${remaining} pc=${formatHex(core.state.pc)}H sp=${formatHex(core.state.sp)}H`);
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
    console.log(`pc/sp  : ${formatHex(core.state.pc)}H / ${formatHex(core.state.sp)}H`);
    if (result.history && result.history.length > 0) {
      console.log("history:");
      console.log(result.history.join(" "));
    }
    const out = core.getOutput();
    if (out.length > 0) {
      console.log("output :");
      process.stdout.write(out);
      if (!out.endsWith("\n")) process.stdout.write("\n");
    } else {
      console.log("output : (none)");
    }
  }

  if (!opts.cpm) {
    console.log("");
    console.log("[Hint] Use --cmd \"break 0100h; run 1000; regs\" for command mode.");
    console.log("[Hint] Use --cpm to run immediately.");
  }
}

export { printDisasm };

type DebugRunState = {
  version: 1;
  inputFile: string;
  savedAt: string;
  reason: string;
  snapshot: Z80CoreSnapshot;
};

function readRunState(filePath: string): DebugRunState {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as DebugRunState;
  if (!parsed || parsed.version !== 1 || !parsed.snapshot) {
    throw new Error(`Invalid state file: ${filePath}`);
  }
  return parsed;
}

function writeRunState(filePath: string, state: DebugRunState): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(state);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, text);
  try {
    fs.copyFileSync(tmpPath, filePath);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

function parseListenAddress(raw: string): { host: string; port: number } {
  const s = String(raw).trim();
  const m = /^(.+):(\d+)$/.exec(s);
  if (m) {
    const host = m[1];
    const port = Number.parseInt(m[2], 10);
    if (!(port >= 1 && port <= 65535)) throw new Error(`Invalid rpc listen port: ${raw}`);
    return { host, port };
  }
  const port = Number.parseInt(s, 10);
  if (!(port >= 1 && port <= 65535)) throw new Error(`Invalid rpc listen: ${raw}`);
  return { host: "127.0.0.1", port };
}
