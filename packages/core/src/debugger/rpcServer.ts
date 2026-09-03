import * as net from "net";
import { Z80DebugSession } from "./debugSession";

type RpcRequest = {
  id?: number | string;
  method: string;
  params?: any;
};

type RpcResponse = {
  id?: number | string;
  result?: any;
  error?: { code: string; message: string };
};

type RpcTransport = {
  writeLine: (line: string) => void;
  end?: () => void;
};

function ok(id: number | string | undefined, result: any): RpcResponse {
  return { id, result };
}

function err(id: number | string | undefined, code: string, message: string): RpcResponse {
  return { id, error: { code, message } };
}

function handleRequest(session: Z80DebugSession, req: RpcRequest): RpcResponse {
  const p = req.params ?? {};
  switch (req.method) {
    case "ping":
      return ok(req.id, { pong: true });
    case "getRegisters":
      return ok(req.id, session.getRegisters());
    case "setRegisters":
      return ok(req.id, session.setRegisters(p));
    case "readMemory":
      return ok(req.id, session.readMemory(p.addr ?? 0, p.len ?? 1));
    case "writeMemory":
      session.writeMemory(p.addr ?? 0, p.data ?? []);
      return ok(req.id, { ok: true });
    case "readPort":
      return ok(req.id, session.readPort(p.port ?? 0));
    case "writePort":
      session.writePort(p.port ?? 0, p.value ?? 0);
      return ok(req.id, { ok: true });
    case "addBreakpoint":
      return ok(req.id, session.addBreakpoint(p));
    case "removeBreakpoint":
      return ok(req.id, { removed: session.removeBreakpoint(String(p.id ?? "")) });
    case "listBreakpoints":
      return ok(req.id, session.listBreakpoints());
    case "run":
      return ok(req.id, session.run(p.maxSteps ?? 200000));
    case "pause":
      return ok(req.id, session.pause());
    case "stepInstruction":
      return ok(req.id, session.stepInstruction(p.count ?? 1));
    case "getTimeState":
      return ok(req.id, session.getTimeState());
    case "getCallStack":
      return ok(req.id, session.getCallStack());
    case "getOutput":
      return ok(req.id, session.getOutput());
    case "queueConsoleInput":
      return ok(req.id, { queued: session.queueConsoleInput(String(p.text ?? ""), !!p.appendCr) });
    case "resolveAddress":
      return ok(req.id, session.resolveAddress(p.addr ?? 0));
    case "resolveLocation":
      return ok(req.id, session.resolveLocation(p));
    case "quit":
      return ok(req.id, { bye: true });
    default:
      return err(req.id, "METHOD_NOT_FOUND", `Unknown method: ${req.method}`);
  }
}

function processLine(session: Z80DebugSession, transport: RpcTransport, line: string): boolean {
  const text = line.trim();
  if (!text) return true;
  let req: RpcRequest;
  try {
    req = JSON.parse(text) as RpcRequest;
  } catch (e: any) {
    transport.writeLine(JSON.stringify(err(undefined, "INVALID_JSON", e?.message ?? String(e))));
    return true;
  }
  try {
    const res = handleRequest(session, req);
    transport.writeLine(JSON.stringify(res));
    if (req.method === "quit") {
      transport.end?.();
      return false;
    }
    return true;
  } catch (e: any) {
    transport.writeLine(JSON.stringify(err(req.id, "INTERNAL_ERROR", e?.message ?? String(e))));
    return true;
  }
}

function createLineReader(
  session: Z80DebugSession,
  transport: RpcTransport,
  onLine: (line: string) => void
): (chunk: Buffer | string) => boolean {
  let carry = "";
  return (chunk: Buffer | string) => {
    carry += chunk.toString();
    while (true) {
      const idx = carry.indexOf("\n");
      if (idx < 0) break;
      const line = carry.slice(0, idx);
      carry = carry.slice(idx + 1);
      const keep = processLine(session, transport, line);
      onLine(line);
      if (!keep) return false;
    }
    return true;
  };
}

export function startDebugRpcStdio(session: Z80DebugSession): void {
  const transport: RpcTransport = {
    writeLine: (line) => process.stdout.write(`${line}\n`),
    end: () => process.exit(0),
  };
  const read = createLineReader(session, transport, () => {});
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { read(chunk); });
}

export function startDebugRpcTcp(session: Z80DebugSession, host: string, port: number): net.Server {
  const server = net.createServer((socket) => {
    const transport: RpcTransport = {
      writeLine: (line) => socket.write(`${line}\n`),
      end: () => socket.end(),
    };
    const read = createLineReader(session, transport, () => {});
    socket.on("data", (chunk) => { read(chunk); });
  });
  server.listen(port, host);
  return server;
}
