import * as fs from "fs";
import * as path from "path";
import { buildAddrToNames, parseSymFile } from "./symbols";
import { decodeOne } from "./disasm";
import { formatHex, parseNum, Z80DebugCore } from "./core";
import { printDisasm, printHexDump, runCommandScript } from "./commandRunner";

function printStaticDisasm(buf: Uint8Array, base: number, from: number, count: number, addrToNames: Map<number, string[]>): void {
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
    console.log(`  ${formatHex(addr)}  ${bytes.padEnd(12)}  ${d.text}${note}`);
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
    entry?: string;
    trace?: boolean;
    bdosTrace?: boolean;
    cmd?: string;
    cpmRoot?: string;
    tail?: string;
  }
) {
  const absInput = path.resolve(inputFile);
  const data = fs.readFileSync(absInput);
  const defaultBase = /\.com$/i.test(absInput) ? 0x100 : 0;
  const base = opts.base ? parseNum(opts.base) : defaultBase;
  const from = opts.from ? parseNum(opts.from) : base;
  const bytes = opts.bytes ? parseNum(opts.bytes) : 0x80;
  const decodeCount = opts.decode ? parseNum(opts.decode) : 24;
  const entry = opts.entry ? parseNum(opts.entry) : 0x0100;
  const maxSteps = opts.steps ? parseNum(opts.steps) : 200000;

  const symPath = opts.sym
    ? path.resolve(opts.sym)
    : fs.existsSync(absInput.replace(/\.[^.]+$/, ".sym"))
      ? absInput.replace(/\.[^.]+$/, ".sym")
      : undefined;
  const symEntries = symPath ? parseSymFile(symPath) : [];
  const addrToNames = buildAddrToNames(symEntries);

  console.log(`file   : ${absInput}`);
  console.log(`size   : ${data.length} bytes`);
  console.log(`base   : ${formatHex(base)}H`);
  console.log(`from   : ${formatHex(from)}H`);
  console.log(`sym    : ${symPath ?? "(none)"}`);

  const core = new Z80DebugCore(!!opts.trace);
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
    runCommandScript(core, opts.cmd, addrToNames);
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
  printStaticDisasm(data, base, from, decodeCount, addrToNames);

  if (opts.cpm) {
    console.log("");
    console.log("[CP/M Run]");
    const result = core.run(maxSteps);
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
