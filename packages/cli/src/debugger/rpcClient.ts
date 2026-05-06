import * as net from "net";
import * as readline from "readline";
import { parseNum } from "./core";

type RpcResponse = {
  id?: number;
  result?: unknown;
  error?: { code: string; message: string };
};

function parseConnect(addr: string): { host: string; port: number } {
  const s = String(addr || "").trim();
  if (!s) return { host: "127.0.0.1", port: 4700 };
  const m = /^(.+):(\d+)$/.exec(s);
  if (m) {
    const port = Number.parseInt(m[2], 10);
    if (!(port >= 1 && port <= 65535)) throw new Error(`Invalid port: ${addr}`);
    return { host: m[1], port };
  }
  const port = Number.parseInt(s, 10);
  if (!(port >= 1 && port <= 65535)) throw new Error(`Invalid connect address: ${addr}`);
  return { host: "127.0.0.1", port };
}

export class DebugRpcClient {
  private socket: net.Socket | null = null;
  private carry = "";
  private nextId = 1;
  private readonly pending = new Map<number, (res: RpcResponse) => void>();

  async connect(addr: string): Promise<void> {
    const { host, port } = parseConnect(addr);
    if (this.socket) return;
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        this.socket = socket;
        resolve();
      });
      socket.on("error", reject);
      socket.on("data", (buf) => this.onData(buf.toString()));
      socket.on("close", () => {
        this.socket = null;
      });
    });
  }

  close(): void {
    this.socket?.end();
    this.socket = null;
  }

  request(method: string, params?: unknown): Promise<RpcResponse> {
    if (!this.socket) throw new Error("Not connected");
    const id = this.nextId++;
    const req = params === undefined ? { id, method } : { id, method, params };
    const line = JSON.stringify(req);
    return new Promise<RpcResponse>((resolve, reject) => {
      this.pending.set(id, resolve);
      try {
        this.socket?.write(`${line}\n`);
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  private onData(chunk: string): void {
    this.carry += chunk;
    while (true) {
      const idx = this.carry.indexOf("\n");
      if (idx < 0) break;
      const line = this.carry.slice(0, idx).trim();
      this.carry = this.carry.slice(idx + 1);
      if (!line) continue;
      let res: RpcResponse;
      try {
        res = JSON.parse(line) as RpcResponse;
      } catch {
        continue;
      }
      if (typeof res.id !== "number") continue;
      const done = this.pending.get(res.id);
      if (!done) continue;
      this.pending.delete(res.id);
      done(res);
    }
  }
}

function pretty(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

function parseBytes(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseNum(s) & 0xff);
}

export async function runRemoteCommand(
  client: DebugRpcClient,
  raw: string,
): Promise<boolean> {
  const line = raw.trim();
  if (!line) return true;
  const t = line.split(/\s+/);
  const cmd = t[0].toLowerCase();

  const send = async (method: string, params?: unknown): Promise<boolean> => {
    const res = await client.request(method, params);
    if (res.error) {
      console.error(`${res.error.code}: ${res.error.message}`);
      return true;
    }
    console.log(pretty(res.result));
    if (method === "quit") return false;
    return true;
  };

  if (cmd === "quit" || cmd === "q" || cmd === "exit") return send("quit");
  if (cmd === "ping") return send("ping");
  if (cmd === "regs" || cmd === "r") return send("getRegisters");
  if (cmd === "break" || cmd === "b") {
    const sub = (t[1] ?? "list").toLowerCase();
    if (sub === "list") return send("listBreakpoints");
    if ((sub === "add" || sub === "del") && t[2]) {
      if (sub === "add") {
        return send("addBreakpoint", { kind: "exec", addr: parseNum(t[2]) & 0xffff, enabled: true });
      }
      return send("removeBreakpoint", { id: t[2] });
    }
    throw new Error(`Invalid break command: ${line}`);
  }
  if (cmd === "step" || cmd === "s") {
    return send("stepInstruction", { count: t[1] ? parseNum(t[1]) : 1 });
  }
  if (cmd === "run" || cmd === "c") {
    return send("run", { maxSteps: t[1] ? parseNum(t[1]) : 200000 });
  }
  if (cmd === "pause") return send("pause");
  if (cmd === "time") return send("getTimeState");
  if (cmd === "where") {
    if (!t[1]) throw new Error(`Invalid where command: ${line}`);
    return send("resolveAddress", { addr: parseNum(t[1]) & 0xffff });
  }
  if (cmd === "loc") {
    if (!t[1] || !t[2]) throw new Error(`Invalid loc command: ${line}`);
    const file = t[1];
    const lineNo = parseNum(t[2]);
    const column = t[3] ? parseNum(t[3]) : undefined;
    return send("resolveLocation", column != null ? { file, line: lineNo, column } : { file, line: lineNo });
  }
  if (cmd === "mem" || cmd === "d") {
    const addr = t[1] ? parseNum(t[1]) : 0;
    const len = t[2] ? parseNum(t[2]) : 64;
    return send("readMemory", { addr, len });
  }
  if (cmd === "write" || cmd === "wm") {
    if (!t[1] || !t[2]) throw new Error(`Invalid write command: ${line}`);
    const addr = parseNum(t[1]);
    const data = parseBytes(t.slice(2).join(" "));
    return send("writeMemory", { addr, data });
  }
  if (cmd === "readport" || cmd === "inp") {
    if (!t[1]) throw new Error(`Invalid readport command: ${line}`);
    return send("readPort", { port: parseNum(t[1]) & 0xffff });
  }
  if (cmd === "writeport" || cmd === "outp") {
    if (!t[1] || !t[2]) throw new Error(`Invalid writeport command: ${line}`);
    return send("writePort", { port: parseNum(t[1]) & 0xffff, value: parseNum(t[2]) & 0xff });
  }
  throw new Error(`Unknown command: ${line}`);
}

export async function runRemoteScript(
  client: DebugRpcClient,
  script: string,
): Promise<void> {
  const commands = script
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const c of commands) {
    const keep = await runRemoteCommand(client, c);
    if (!keep) break;
  }
}

export async function runRemoteRepl(client: DebugRpcClient): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "dbg-remote> ",
  });
  rl.prompt();
  for await (const line of rl) {
    try {
      const keep = await runRemoteCommand(client, line);
      if (!keep) break;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
    }
    rl.prompt();
  }
  rl.close();
}
