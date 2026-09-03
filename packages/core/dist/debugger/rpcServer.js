"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDebugRpcStdio = startDebugRpcStdio;
exports.startDebugRpcTcp = startDebugRpcTcp;
const net = __importStar(require("net"));
function ok(id, result) {
    return { id, result };
}
function err(id, code, message) {
    return { id, error: { code, message } };
}
function handleRequest(session, req) {
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
function processLine(session, transport, line) {
    const text = line.trim();
    if (!text)
        return true;
    let req;
    try {
        req = JSON.parse(text);
    }
    catch (e) {
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
    }
    catch (e) {
        transport.writeLine(JSON.stringify(err(req.id, "INTERNAL_ERROR", e?.message ?? String(e))));
        return true;
    }
}
function createLineReader(session, transport, onLine) {
    let carry = "";
    return (chunk) => {
        carry += chunk.toString();
        while (true) {
            const idx = carry.indexOf("\n");
            if (idx < 0)
                break;
            const line = carry.slice(0, idx);
            carry = carry.slice(idx + 1);
            const keep = processLine(session, transport, line);
            onLine(line);
            if (!keep)
                return false;
        }
        return true;
    };
}
function startDebugRpcStdio(session) {
    const transport = {
        writeLine: (line) => process.stdout.write(`${line}\n`),
        end: () => process.exit(0),
    };
    const read = createLineReader(session, transport, () => { });
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { read(chunk); });
}
function startDebugRpcTcp(session, host, port) {
    const server = net.createServer((socket) => {
        const transport = {
            writeLine: (line) => socket.write(`${line}\n`),
            end: () => socket.end(),
        };
        const read = createLineReader(session, transport, () => { });
        socket.on("data", (chunk) => { read(chunk); });
    });
    server.listen(port, host);
    return server;
}
