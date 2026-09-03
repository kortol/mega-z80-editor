import { CallFrame, CpuState, StepResult, Z80DebugCore } from "./core";
import { SourceMapEntry } from "../sourcemap/model";

export type DebugRegisters = CpuState;

export type StopReason =
  | { kind: "breakpoint"; breakpointId?: string; address?: number; message?: string }
  | { kind: "watchpoint"; access: "read" | "write" | "io"; address?: number; message?: string }
  | { kind: "step"; message?: string }
  | { kind: "pause"; message?: string }
  | { kind: "reset"; message?: string }
  | { kind: "interrupt"; mode: "INT" | "NMI"; vector?: number; message?: string }
  | { kind: "exception"; message: string }
  | { kind: "halt"; message?: string }
  | { kind: "targetExit"; message?: string };

export type ExecBreakpoint = {
  id: string;
  kind: "exec";
  addr: number;
  enabled: boolean;
  condition?: string;
};

export type MemBreakpoint = {
  id: string;
  kind: "mem";
  access: "r" | "w" | "rw";
  addr: number;
  mask?: number;
  enabled: boolean;
};

export type IoBreakpoint = {
  id: string;
  kind: "io";
  access: "in" | "out" | "inout";
  port: number;
  mask?: number;
  enabled: boolean;
};

export type InterruptBreakpoint = {
  id: string;
  kind: "interrupt";
  mode: "INT" | "NMI";
  enabled: boolean;
};

export type TimeBreakpoint = {
  id: string;
  kind: "time";
  tstate?: string;
  frame?: number;
  enabled: boolean;
};

export type Breakpoint =
  | ExecBreakpoint
  | MemBreakpoint
  | IoBreakpoint
  | InterruptBreakpoint
  | TimeBreakpoint;

export type NewBreakpoint =
  | (Omit<ExecBreakpoint, "id"> & { id?: string })
  | (Omit<MemBreakpoint, "id"> & { id?: string })
  | (Omit<IoBreakpoint, "id"> & { id?: string })
  | (Omit<InterruptBreakpoint, "id"> & { id?: string })
  | (Omit<TimeBreakpoint, "id"> & { id?: string });

export type DebugTimeState = {
  instructionCount: number;
  tstateTotal: string;
};

export type SourceLocation = {
  file: string;
  line: number;
  column?: number;
};

export type ResolvedAddress = {
  addr: number;
  file: string;
  line: number;
  column?: number;
  module?: string;
  section?: string;
};

export type DebugCallFrame = CallFrame;

export class Z80DebugSession {
  private readonly breakpoints = new Map<string, Breakpoint>();
  private readonly sourceEntries: SourceMapEntry[];
  private readonly addrToSource = new Map<number, SourceMapEntry>();
  private nextBpId = 1;

  constructor(readonly core: Z80DebugCore, sourceEntries: SourceMapEntry[] = []) {
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
        if (!this.addrToSource.has(a)) this.addrToSource.set(a, e);
      }
    }
  }

  resetBreakpoints(): void {
    this.core.breakpoints.clear();
    this.breakpoints.clear();
  }

  run(maxSteps: number): { stop: StopReason; history: string[] } {
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

  stepInstruction(count = 1): { stop: StopReason; history: string[] } {
    const n = Math.max(1, count | 0);
    let last: StepResult = { stopped: false };
    for (let i = 0; i < n; i++) {
      last = this.stepOverCurrentBreakpointIfNeeded() ?? this.core.step();
      if (last.stopped) break;
    }
    if (!last.stopped) {
      return { stop: { kind: "step", message: `Stepped ${n} instruction(s)` }, history: [] };
    }
    return {
      stop: this.mapStopReason(last),
      history: last.history ?? [],
    };
  }

  pause(): StopReason {
    return { kind: "pause", message: "Pause requested" };
  }

  getRegisters(): DebugRegisters {
    return this.core.getRegisters();
  }

  setRegisters(partial: Partial<DebugRegisters>): DebugRegisters {
    this.core.setRegisters(partial);
    return this.core.getRegisters();
  }

  readMemory(addr: number, len: number): number[] {
    return this.core.readMemory(addr, len);
  }

  writeMemory(addr: number, data: ArrayLike<number>): void {
    this.core.writeMemory(addr, data);
  }

  readPort(port: number): number {
    return this.core.readPort(port);
  }

  writePort(port: number, value: number): void {
    this.core.writePort(port, value);
  }

  addBreakpoint(input: NewBreakpoint): Breakpoint {
    const id = input.id ?? `bp-${this.nextBpId++}`;
    const bp = { ...input, id } as Breakpoint;
    this.breakpoints.set(id, bp);
    this.applyBreakpoint(bp);
    return bp;
  }

  removeBreakpoint(id: string): boolean {
    const bp = this.breakpoints.get(id);
    if (!bp) return false;
    this.unapplyBreakpoint(bp);
    this.breakpoints.delete(id);
    return true;
  }

  listBreakpoints(): Breakpoint[] {
    return [...this.breakpoints.values()];
  }

  getTimeState(): DebugTimeState {
    return {
      instructionCount: this.core.steps,
      tstateTotal: String(this.core.steps),
    };
  }

  getCallStack(): DebugCallFrame[] {
    return this.core.getCallStack();
  }

  getOutput(): string {
    return this.core.getOutput();
  }

  queueConsoleInput(text: string, appendCr = false): number {
    return this.core.queueConsoleInput(text, appendCr);
  }

  resolveAddress(addr: number): ResolvedAddress | null {
    const a = addr & 0xffff;
    const e = this.addrToSource.get(a);
    if (!e) return null;
    return {
      addr: a,
      file: e.file,
      line: e.line,
      column: e.column,
      module: e.module,
      section: e.section,
    };
  }

  resolveLocation(loc: SourceLocation): number[] {
    const file = this.normalizePath(loc.file);
    const line = Math.max(1, loc.line | 0);
    const col = loc.column != null ? Math.max(1, loc.column | 0) : undefined;
    const out = new Set<number>();
    for (const e of this.sourceEntries) {
      if (!this.isSameSourceFile(e.file, file)) continue;
      if (e.line !== line) continue;
      if (col != null && e.column != null && e.column !== col) continue;
      out.add(e.addr & 0xffff);
    }
    return [...out].sort((a, b) => a - b);
  }

  private applyBreakpoint(bp: Breakpoint): void {
    if (!bp.enabled) return;
    if (bp.kind === "exec") {
      this.core.breakpoints.add(bp.addr & 0xffff);
    }
  }

  private unapplyBreakpoint(bp: Breakpoint): void {
    if (bp.kind === "exec") {
      this.core.breakpoints.delete(bp.addr & 0xffff);
    }
  }

  private mapStopReason(res: StepResult): StopReason {
    const msg = res.reason ?? "stopped";
    if (/^Breakpoint hit at /i.test(msg)) {
      const m = /at\s+([0-9A-F]{4})H/i.exec(msg);
      const addr = m ? Number.parseInt(m[1], 16) : undefined;
      const match = addr != null
        ? [...this.breakpoints.values()].find((b) => b.kind === "exec" && (b.addr & 0xffff) === addr)
        : undefined;
      return { kind: "breakpoint", breakpointId: match?.id, address: addr, message: msg };
    }
    if (/HALT/i.test(msg)) return { kind: "halt", message: msg };
    if (/PC reached 0000H|target exit|warm boot/i.test(msg)) return { kind: "targetExit", message: msg };
    if (/Step limit reached/i.test(msg)) return { kind: "step", message: msg };
    if (/Unsupported opcode|Invalid|out of image range/i.test(msg)) {
      return { kind: "exception", message: msg };
    }
    return { kind: "exception", message: msg };
  }

  private normalizePath(p: string): string {
    return String(p ?? "").replace(/\\/g, "/").toLowerCase();
  }

  private isSameSourceFile(entryFile: string, requestedFile: string): boolean {
    const a = this.normalizePath(entryFile);
    const b = this.normalizePath(requestedFile);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
  }

  private stepOverCurrentBreakpointIfNeeded(): StepResult | null {
    const pc = this.core.getRegisters().pc & 0xffff;
    const bp = [...this.breakpoints.values()].find(
      (entry) => entry.kind === "exec" && entry.enabled && (entry.addr & 0xffff) === pc
    );
    if (!bp) return null;

    this.unapplyBreakpoint(bp);
    try {
      return this.core.step();
    } finally {
      this.applyBreakpoint(bp);
    }
  }
}
