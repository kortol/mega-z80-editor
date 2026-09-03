import * as fs from "fs";
import * as path from "path";
import { CpuState, formatHex } from "./core";

type FileHandle = {
  name: string;
  fd: number;
  pos: number;
};

type CpmEnv = {
  read8: (addr: number) => number;
  write8: (addr: number, value: number) => void;
  getDma: () => number;
  setDma: (addr: number) => void;
  output: (text: string) => void;
  rootDir: string;
  trace?: boolean;
  interactive?: () => boolean;
  readConsoleChar?: (blocking: boolean) => number | undefined;
  hasConsoleChar?: () => boolean;
  readConsoleLine?: (maxLen: number) => string;
};

export class CpmBdos {
  private env: CpmEnv;
  private handles = new Map<string, FileHandle>();
  private searchResults: string[] = [];
  private searchIndex = 0;

  constructor(env: CpmEnv) {
    this.env = env;
  }

  setRootDir(rootDir: string) {
    this.env.rootDir = rootDir;
  }

  setTrace(trace: boolean) {
    this.env.trace = trace;
  }

  private traceLog(text: string): void {
    if (!this.env.trace) return;
    console.error(`[BDOS] ${text}`);
  }

  private traceExtra(fn: number, state: CpuState): string {
    if (fn === 10) {
      const addr = this.fcbAddr(state);
      const maxLen = this.env.read8(addr) & 0xff;
      return ` buf=${formatHex(addr)} max=${maxLen}`;
    }
    if (fn === 26) {
      const dma = ((state.d & 0xff) << 8) | (state.e & 0xff);
      return ` dma=${formatHex(dma)}`;
    }
    if (fn === 15 || fn === 16 || fn === 17 || fn === 19 || fn === 20 || fn === 21 || fn === 22 || fn === 23 || fn === 33 || fn === 34 || fn === 35 || fn === 36) {
      const info = this.readFcb(this.fcbAddr(state));
      if (!info) return " fcb=(invalid)";
      return ` fcb=${this.buildHostName(info)}`;
    }
    return "";
  }

  handle(fn: number, state: CpuState): string | undefined {
    const beforeA = state.a & 0xff;
    const de = ((state.d & 0xff) << 8) | (state.e & 0xff);
    const traceThisCall = fn !== 6;
    if (traceThisCall) {
      this.traceLog(`IN fn=${fn} C=${formatHex(state.c, 2)} DE=${formatHex(de)} A=${formatHex(beforeA, 2)}${this.traceExtra(fn, state)}`);
    }
    let stop: string | undefined;
    switch (fn) {
      case 0:
        stop = "BDOS 0: terminate";
        break;
      case 1:
        // Console input: blocking in interactive mode, CR in non-interactive mode.
        if (this.env.interactive?.() && this.env.readConsoleChar) {
          state.a = this.env.readConsoleChar(true) ?? 0x0d;
        } else {
          state.a = 0x0d;
        }
        break;
      case 2:
        this.env.output(String.fromCharCode(state.e & 0xff));
        state.a = state.e & 0xff;
        break;
      case 6:
        // Direct console I/O.
        // E=FF: console input status/char (non-interactive: no key -> 0)
        // E!=FF: console output of character E.
        if ((state.e & 0xff) === 0xff) {
          const ch =
            (this.env.interactive?.() && this.env.readConsoleChar)
              ? this.env.readConsoleChar(false)
              : undefined;
          state.a = ch == null ? 0x00 : (ch & 0xff);
        } else {
          const ch = state.e & 0xff;
          this.env.output(String.fromCharCode(ch));
          state.a = ch;
        }
        break;
      case 9:
        this.writeDollarString(state);
        state.a = 0x00;
        break;
      case 11:
        state.a =
          (this.env.interactive?.() && this.env.hasConsoleChar?.())
            ? 0xff
            : 0x00;
        break;
      case 12:
        state.a = 0x22;
        break;
      case 10:
        this.readBufferedConsole(state);
        state.a = 0x00;
        break;
      case 15:
        state.a = this.openFile(state) ? 0x00 : 0xff;
        break;
      case 16:
        state.a = this.closeFile(state) ? 0x00 : 0xff;
        break;
      case 17:
        state.a = this.searchFirst(state) ? 0x00 : 0xff;
        break;
      case 18:
        state.a = this.searchNext(state) ? 0x00 : 0xff;
        break;
      case 19:
        state.a = this.deleteFiles(state) ? 0x00 : 0xff;
        break;
      case 20:
        state.a = this.readSequential(state);
        break;
      case 21:
        state.a = this.writeSequential(state);
        break;
      case 22:
        state.a = this.makeFile(state) ? 0x00 : 0xff;
        break;
      case 23:
        state.a = this.renameFile(state) ? 0x00 : 0xff;
        break;
      case 26:
        this.env.setDma(((state.d & 0xff) << 8) | (state.e & 0xff));
        state.a = 0x00;
        break;
      case 33:
        state.a = this.readRandom(state);
        break;
      case 34:
        state.a = this.writeRandom(state);
        break;
      case 35:
        state.a = this.computeFileSize(state) ? 0x00 : 0xff;
        break;
      case 36:
        state.a = this.setRandomRecord(state) ? 0x00 : 0xff;
        break;
      case 40:
        // CP/M 3 style random write with zero fill.
        // For now, emulate as random write at current record.
        state.a = this.writeRandom(state);
        break;
      default:
        state.a = 0x00;
        break;
    }
    if (traceThisCall) {
      this.traceLog(`OUT fn=${fn} A=${formatHex(state.a, 2)}${stop ? ` stop=${stop}` : ""}`);
    }
    return stop;
  }

  private writeDollarString(state: CpuState) {
    let p = ((state.d & 0xff) << 8) | (state.e & 0xff);
    let guard = 0;
    while (guard++ < 0x10000) {
      const ch = this.env.read8(p++);
      if (ch === 0x24) break;
      this.env.output(String.fromCharCode(ch));
    }
  }

  private readBufferedConsole(state: CpuState): void {
    const addr = this.fcbAddr(state);
    const maxLen = this.env.read8(addr) & 0xff;
    if (this.env.interactive?.() && this.env.readConsoleLine) {
      const line = this.env.readConsoleLine(maxLen);
      const bytes = Buffer.from(line, "ascii");
      const len = Math.min(maxLen, bytes.length);
      this.env.write8(addr + 1, len & 0xff);
      for (let i = 0; i < len; i++) this.env.write8(addr + 2 + i, bytes[i] & 0x7f);
      this.env.write8(addr + 2 + len, 0x0d);
    } else {
      // Non-interactive default: empty line (CR only).
      this.env.write8(addr + 1, 0x00);
      if (maxLen > 0) {
        this.env.write8(addr + 2, 0x0d);
      }
    }
  }

  private fcbAddr(state: CpuState): number {
    return ((state.d & 0xff) << 8) | (state.e & 0xff);
  }

  private decodeFcbChar(v: number): string {
    const x = v & 0x7f;
    if (x === 0x00) return " ";
    if (x === 0x3f) return "?";
    if (x < 0x20 || x > 0x7e) return " ";
    return String.fromCharCode(x);
  }

  private readFcb(addr: number): { name: string; ext: string; hasWildcard: boolean } | null {
    const drive = this.env.read8(addr);
    if (drive === 0xe5) return null;
    const nameChars: string[] = [];
    const extChars: string[] = [];
    let hasWildcard = false;
    for (let i = 0; i < 8; i++) {
      const v = this.env.read8(addr + 1 + i);
      if (v === 0x3f) hasWildcard = true;
      nameChars.push(this.decodeFcbChar(v));
    }
    for (let i = 0; i < 3; i++) {
      const v = this.env.read8(addr + 9 + i);
      if (v === 0x3f) hasWildcard = true;
      extChars.push(this.decodeFcbChar(v));
    }
    const name = nameChars.join("").trim();
    const ext = extChars.join("").trim();
    if (!name) return null;
    return { name: name.toUpperCase(), ext: ext.toUpperCase(), hasWildcard };
  }

  private buildHostName(info: { name: string; ext: string }): string {
    const safe = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
    const name = safe(info.name);
    const ext = safe(info.ext);
    return ext ? `${name}.${ext}` : name;
  }

  private listMatching(pattern: { name: string; ext: string; hasWildcard: boolean }): string[] {
    const root = this.env.rootDir;
    if (!fs.existsSync(root)) return [];
    const entries = fs.readdirSync(root);
    const re = this.patternToRegex(pattern);
    return entries.filter((e) => re.test(e.toUpperCase()));
  }

  private patternToRegex(pattern: { name: string; ext: string; hasWildcard: boolean }): RegExp {
    const name = (pattern.name + "        ").slice(0, 8);
    const ext = (pattern.ext + "   ").slice(0, 3);
    const toRe = (s: string) =>
      s
        .split("")
        .map((c) => (c === "?" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("");
    return new RegExp(`^${toRe(name).trim()}(\\.${toRe(ext).trim()})?$`, "i");
  }

  private writeDirEntry(file: string): void {
    const dma = this.env.getDma();
    const parts = file.toUpperCase().split(".");
    const name = (parts[0] ?? "").padEnd(8, " ").slice(0, 8);
    const ext = (parts[1] ?? "").padEnd(3, " ").slice(0, 3);
    this.env.write8(dma, 0);
    for (let i = 0; i < 8; i++) this.env.write8(dma + 1 + i, name.charCodeAt(i));
    for (let i = 0; i < 3; i++) this.env.write8(dma + 9 + i, ext.charCodeAt(i));
    for (let i = 12; i < 32; i++) this.env.write8(dma + i, 0);
  }

  private openFile(state: CpuState): boolean {
    const info = this.readFcb(this.fcbAddr(state));
    if (!info || info.hasWildcard) return false;
    const hostName = this.buildHostName(info);
    const fullPath = path.join(this.env.rootDir, hostName);
    if (!fs.existsSync(fullPath)) return false;
    const fd = fs.openSync(fullPath, "r+");
    this.handles.set(hostName, { name: hostName, fd, pos: 0 });
    return true;
  }

  private closeFile(state: CpuState): boolean {
    const info = this.readFcb(this.fcbAddr(state));
    if (!info) return false;
    const hostName = this.buildHostName(info);
    const handle = this.handles.get(hostName);
    if (!handle) return false;
    fs.closeSync(handle.fd);
    this.handles.delete(hostName);
    return true;
  }

  private makeFile(state: CpuState): boolean {
    const info = this.readFcb(this.fcbAddr(state));
    if (!info || info.hasWildcard) return false;
    const hostName = this.buildHostName(info);
    const fullPath = path.join(this.env.rootDir, hostName);
    const fd = fs.openSync(fullPath, "w+");
    this.handles.set(hostName, { name: hostName, fd, pos: 0 });
    return true;
  }

  private renameFile(state: CpuState): boolean {
    const addr = this.fcbAddr(state);
    const newInfo = this.readFcb(addr);
    const oldInfo = this.readFcb(addr + 16);
    if (!newInfo || !oldInfo) return false;
    if (newInfo.hasWildcard || oldInfo.hasWildcard) return false;
    const oldName = this.buildHostName(oldInfo);
    const newName = this.buildHostName(newInfo);
    const oldPath = path.join(this.env.rootDir, oldName);
    const newPath = path.join(this.env.rootDir, newName);
    if (!fs.existsSync(oldPath)) return false;
    fs.renameSync(oldPath, newPath);
    return true;
  }

  private deleteFiles(state: CpuState): boolean {
    const info = this.readFcb(this.fcbAddr(state));
    if (!info) return false;
    const matches = this.listMatching(info);
    if (matches.length === 0) {
      // BBC BASIC SAVE issues ERA before MAKE. Treat no-match as success so
      // the create/write path can proceed even when file does not yet exist.
      return true;
    }
    for (const file of matches) {
      const p = path.join(this.env.rootDir, file);
      try {
        fs.unlinkSync(p);
      } catch { }
    }
    return true;
  }

  private searchFirst(state: CpuState): boolean {
    const info = this.readFcb(this.fcbAddr(state));
    if (!info) return false;
    this.searchResults = this.listMatching(info);
    this.searchIndex = 0;
    return this.searchNext(state);
  }

  private searchNext(_state: CpuState): boolean {
    if (this.searchIndex >= this.searchResults.length) return false;
    const file = this.searchResults[this.searchIndex++];
    this.writeDirEntry(file);
    return true;
  }

  private getHandleFor(state: CpuState): FileHandle | null {
    const info = this.readFcb(this.fcbAddr(state));
    if (!info) return null;
    const hostName = this.buildHostName(info);
    return this.handles.get(hostName) ?? null;
  }

  private readSequential(state: CpuState): number {
    const handle = this.getHandleFor(state);
    if (!handle) return 0xff;
    const buf = Buffer.alloc(128);
    const bytes = fs.readSync(handle.fd, buf, 0, 128, handle.pos);
    handle.pos += bytes;
    const dma = this.env.getDma();
    for (let i = 0; i < 128; i++) this.env.write8(dma + i, buf[i] ?? 0);
    return bytes === 0 ? 0x01 : 0x00;
  }

  private writeSequential(state: CpuState): number {
    const handle = this.getHandleFor(state);
    if (!handle) return 0xff;
    const dma = this.env.getDma();
    const buf = Buffer.alloc(128);
    for (let i = 0; i < 128; i++) buf[i] = this.env.read8(dma + i);
    fs.writeSync(handle.fd, buf, 0, 128, handle.pos);
    handle.pos += 128;
    return 0x00;
  }

  private readRandom(state: CpuState): number {
    const handle = this.getHandleFor(state);
    if (!handle) return 0xff;
    const addr = this.fcbAddr(state);
    const rec = this.env.read8(addr + 33) | (this.env.read8(addr + 34) << 8) | (this.env.read8(addr + 35) << 16);
    handle.pos = rec * 128;
    return this.readSequential(state);
  }

  private writeRandom(state: CpuState): number {
    const handle = this.getHandleFor(state);
    if (!handle) return 0xff;
    const addr = this.fcbAddr(state);
    const rec = this.env.read8(addr + 33) | (this.env.read8(addr + 34) << 8) | (this.env.read8(addr + 35) << 16);
    handle.pos = rec * 128;
    return this.writeSequential(state);
  }

  private computeFileSize(state: CpuState): boolean {
    const info = this.readFcb(this.fcbAddr(state));
    if (!info) return false;
    const hostName = this.buildHostName(info);
    const fullPath = path.join(this.env.rootDir, hostName);
    if (!fs.existsSync(fullPath)) return false;
    const size = fs.statSync(fullPath).size;
    const records = Math.ceil(size / 128);
    const addr = this.fcbAddr(state);
    this.env.write8(addr + 33, records & 0xff);
    this.env.write8(addr + 34, (records >> 8) & 0xff);
    this.env.write8(addr + 35, (records >> 16) & 0xff);
    return true;
  }

  private setRandomRecord(state: CpuState): boolean {
    const handle = this.getHandleFor(state);
    if (!handle) return false;
    const records = Math.floor(handle.pos / 128);
    const addr = this.fcbAddr(state);
    this.env.write8(addr + 33, records & 0xff);
    this.env.write8(addr + 34, (records >> 8) & 0xff);
    this.env.write8(addr + 35, (records >> 16) & 0xff);
    return true;
  }
}
