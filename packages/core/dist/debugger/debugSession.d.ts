import { CallFrame, CpuState, Z80DebugCore } from "./core";
import { SourceMapEntry } from "../sourcemap/model";
export type DebugRegisters = CpuState;
export type StopReason = {
    kind: "breakpoint";
    breakpointId?: string;
    address?: number;
    message?: string;
} | {
    kind: "watchpoint";
    access: "read" | "write" | "io";
    address?: number;
    message?: string;
} | {
    kind: "step";
    message?: string;
} | {
    kind: "pause";
    message?: string;
} | {
    kind: "reset";
    message?: string;
} | {
    kind: "interrupt";
    mode: "INT" | "NMI";
    vector?: number;
    message?: string;
} | {
    kind: "exception";
    message: string;
} | {
    kind: "halt";
    message?: string;
} | {
    kind: "targetExit";
    message?: string;
};
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
export type Breakpoint = ExecBreakpoint | MemBreakpoint | IoBreakpoint | InterruptBreakpoint | TimeBreakpoint;
export type NewBreakpoint = (Omit<ExecBreakpoint, "id"> & {
    id?: string;
}) | (Omit<MemBreakpoint, "id"> & {
    id?: string;
}) | (Omit<IoBreakpoint, "id"> & {
    id?: string;
}) | (Omit<InterruptBreakpoint, "id"> & {
    id?: string;
}) | (Omit<TimeBreakpoint, "id"> & {
    id?: string;
});
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
export declare class Z80DebugSession {
    readonly core: Z80DebugCore;
    private readonly breakpoints;
    private readonly sourceEntries;
    private readonly addrToSource;
    private nextBpId;
    constructor(core: Z80DebugCore, sourceEntries?: SourceMapEntry[]);
    resetBreakpoints(): void;
    run(maxSteps: number): {
        stop: StopReason;
        history: string[];
    };
    stepInstruction(count?: number): {
        stop: StopReason;
        history: string[];
    };
    pause(): StopReason;
    getRegisters(): DebugRegisters;
    setRegisters(partial: Partial<DebugRegisters>): DebugRegisters;
    readMemory(addr: number, len: number): number[];
    writeMemory(addr: number, data: ArrayLike<number>): void;
    readPort(port: number): number;
    writePort(port: number, value: number): void;
    addBreakpoint(input: NewBreakpoint): Breakpoint;
    removeBreakpoint(id: string): boolean;
    listBreakpoints(): Breakpoint[];
    getTimeState(): DebugTimeState;
    getCallStack(): DebugCallFrame[];
    getOutput(): string;
    queueConsoleInput(text: string, appendCr?: boolean): number;
    resolveAddress(addr: number): ResolvedAddress | null;
    resolveLocation(loc: SourceLocation): number[];
    private applyBreakpoint;
    private unapplyBreakpoint;
    private mapStopReason;
    private normalizePath;
    private isSameSourceFile;
    private stepOverCurrentBreakpointIfNeeded;
}
