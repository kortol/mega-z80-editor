import { decodeOne } from "./disasm";
import { formatHex, parseNum, Z80DebugCore } from "./core";
import { SourceMapEntry } from "../sourcemap/model";

export function printHexDump(mem: Uint8Array, from: number, bytes: number): void {
  const start = Math.max(0, Math.min(0xffff, from));
  const end = Math.max(start, Math.min(0x10000, start + bytes));
  for (let addr = start; addr < end; addr += 16) {
    const row = mem.slice(addr, Math.min(end, addr + 16));
    const hex = Array.from(row).map((b) => formatHex(b, 2)).join(" ");
    console.log(`${formatHex(addr)}: ${hex}`);
  }
}

export function printDisasm(
  mem: Uint8Array,
  from: number,
  count: number,
  addrToNames: Map<number, string[]>,
  addrToSource?: Map<number, SourceMapEntry>
): void {
  let addr = from & 0xffff;
  for (let i = 0; i < count && addr < 0x10000; i++) {
    const names = addrToNames.get(addr);
    if (names && names.length > 0) console.log(`${names.join(", ")}:`);
    const d = decodeOne(mem, addr, addr);
    const bytes = Array.from(mem.slice(addr, Math.min(0x10000, addr + d.size)))
      .map((b) => formatHex(b, 2))
      .join(" ");
    const targetNames = d.target != null ? addrToNames.get(d.target) : undefined;
    const note = targetNames && targetNames.length > 0 ? ` ; -> ${targetNames.join(", ")}` : "";
    const src = addrToSource?.get(addr);
    const srcNote = src ? ` ; ${src.file}:${src.line}` : "";
    console.log(`  ${formatHex(addr)}  ${bytes.padEnd(12)}  ${d.text}${note}${srcNote}`);
    addr += d.size;
  }
}

function printRegs(core: Z80DebugCore): void {
  const s = core.state;
  console.log(
    `A=${formatHex(s.a, 2)} F=${formatHex(s.f, 2)} BC=${formatHex((s.b << 8) | s.c)} DE=${formatHex((s.d << 8) | s.e)} HL=${formatHex((s.h << 8) | s.l)} IX=${formatHex(s.ix)} IY=${formatHex(s.iy)} SP=${formatHex(s.sp)} PC=${formatHex(s.pc)}`
  );
}

function printStepTrace(
  core: Z80DebugCore,
  addrToNames: Map<number, string[]>,
  addrToSource?: Map<number, SourceMapEntry>
): void {
  printRegs(core);
  printDisasm(core.mem, core.state.pc, 1, addrToNames, addrToSource);
}

function printHelp(): void {
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

type CommandContext = {
  traceEachStep: boolean;
};

function runOneCommand(
  core: Z80DebugCore,
  raw: string,
  addrToNames: Map<number, string[]>,
  ctx: CommandContext,
  addrToSource?: Map<number, SourceMapEntry>
): boolean {
  const line = raw.trim();
  if (!line) return true;
  const t = line.split(/\s+/);
  const cmd = t[0].toLowerCase();

  if (cmd === "help" || cmd === "h") {
    printHelp();
    return true;
  }
  if (cmd === "quit" || cmd === "q") return false;
  if (cmd === "regs" || cmd === "r") {
    printRegs(core);
    return true;
  }
  if (cmd === "step" || cmd === "s") {
    const n = t[1] ? parseNum(t[1]) : 1;
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
    const n = t[1] ? parseNum(t[1]) : 200000;
    let stopReason: string | undefined;
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
    if (!stopReason) stopReason = `Step limit reached (${n})`;
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
    const addr = t[1] ? parseNum(t[1]) : core.state.pc;
    const count = t[2] ? parseNum(t[2]) : 16;
    printDisasm(core.mem, addr, count, addrToNames, addrToSource);
    return true;
  }
  if (cmd === "mem" || cmd === "d") {
    const addr = t[1] ? parseNum(t[1]) : core.state.pc;
    const bytes = t[2] ? parseNum(t[2]) : 64;
    printHexDump(core.mem, addr, bytes);
    return true;
  }
  if (cmd === "break" || cmd === "b") {
    const sub = (t[1] ?? "list").toLowerCase();
    if (sub === "list") {
      const points = [...core.breakpoints.values()].sort((a, b) => a - b).map((x) => `${formatHex(x)}H`);
      console.log(points.length ? `breakpoints: ${points.join(", ")}` : "breakpoints: (none)");
      return true;
    }
    if ((sub === "add" || sub === "del") && t[2]) {
      const addr = parseNum(t[2]) & 0xffff;
      if (sub === "add") core.breakpoints.add(addr);
      else core.breakpoints.delete(addr);
      return true;
    }
    throw new Error(`Invalid break command: ${line}`);
  }

  throw new Error(`Unknown command: ${line}`);
}

export function runCommandScript(
  core: Z80DebugCore,
  script: string,
  addrToNames: Map<number, string[]>,
  addrToSource?: Map<number, SourceMapEntry>
): void {
  const ctx: CommandContext = {
    traceEachStep: false,
  };
  const commands = script
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const c of commands) {
    const keepGoing = runOneCommand(core, c, addrToNames, ctx, addrToSource);
    if (!keepGoing) break;
  }
}
