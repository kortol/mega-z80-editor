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
exports.DebugRpcClient = void 0;
exports.runRemoteCommand = runRemoteCommand;
exports.runRemoteScript = runRemoteScript;
exports.runRemoteRepl = runRemoteRepl;
const net = __importStar(require("net"));
const readline = __importStar(require("readline"));
const core_1 = require("./core");
function parseConnect(addr) {
    const s = String(addr || "").trim();
    if (!s)
        return { host: "127.0.0.1", port: 4700 };
    const m = /^(.+):(\d+)$/.exec(s);
    if (m) {
        const port = Number.parseInt(m[2], 10);
        if (!(port >= 1 && port <= 65535))
            throw new Error(`Invalid port: ${addr}`);
        return { host: m[1], port };
    }
    const port = Number.parseInt(s, 10);
    if (!(port >= 1 && port <= 65535))
        throw new Error(`Invalid connect address: ${addr}`);
    return { host: "127.0.0.1", port };
}
class DebugRpcClient {
    socket = null;
    carry = "";
    nextId = 1;
    pending = new Map();
    async connect(addr) {
        const { host, port } = parseConnect(addr);
        if (this.socket)
            return;
        await new Promise((resolve, reject) => {
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
    close() {
        this.socket?.end();
        this.socket = null;
    }
    request(method, params) {
        if (!this.socket)
            throw new Error("Not connected");
        const id = this.nextId++;
        const req = params === undefined ? { id, method } : { id, method, params };
        const line = JSON.stringify(req);
        return new Promise((resolve, reject) => {
            this.pending.set(id, resolve);
            try {
                this.socket?.write(`${line}\n`);
            }
            catch (e) {
                this.pending.delete(id);
                reject(e);
            }
        });
    }
    onData(chunk) {
        this.carry += chunk;
        while (true) {
            const idx = this.carry.indexOf("\n");
            if (idx < 0)
                break;
            const line = this.carry.slice(0, idx).trim();
            this.carry = this.carry.slice(idx + 1);
            if (!line)
                continue;
            let res;
            try {
                res = JSON.parse(line);
            }
            catch {
                continue;
            }
            if (typeof res.id !== "number")
                continue;
            const done = this.pending.get(res.id);
            if (!done)
                continue;
            this.pending.delete(res.id);
            done(res);
        }
    }
}
exports.DebugRpcClient = DebugRpcClient;
function pretty(v) {
    if (typeof v === "string")
        return v;
    return JSON.stringify(v, null, 2);
}
function parseBytes(text) {
    return text
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => (0, core_1.parseNum)(s) & 0xff);
}
async function runRemoteCommand(client, raw) {
    const line = raw.trim();
    if (!line)
        return true;
    const t = line.split(/\s+/);
    const cmd = t[0].toLowerCase();
    const send = async (method, params) => {
        const res = await client.request(method, params);
        if (res.error) {
            console.error(`${res.error.code}: ${res.error.message}`);
            return true;
        }
        console.log(pretty(res.result));
        if (method === "quit")
            return false;
        return true;
    };
    if (cmd === "quit" || cmd === "q" || cmd === "exit")
        return send("quit");
    if (cmd === "ping")
        return send("ping");
    if (cmd === "regs" || cmd === "r")
        return send("getRegisters");
    if (cmd === "break" || cmd === "b") {
        const sub = (t[1] ?? "list").toLowerCase();
        if (sub === "list")
            return send("listBreakpoints");
        if ((sub === "add" || sub === "del") && t[2]) {
            if (sub === "add") {
                return send("addBreakpoint", { kind: "exec", addr: (0, core_1.parseNum)(t[2]) & 0xffff, enabled: true });
            }
            return send("removeBreakpoint", { id: t[2] });
        }
        throw new Error(`Invalid break command: ${line}`);
    }
    if (cmd === "step" || cmd === "s") {
        return send("stepInstruction", { count: t[1] ? (0, core_1.parseNum)(t[1]) : 1 });
    }
    if (cmd === "run" || cmd === "c") {
        return send("run", { maxSteps: t[1] ? (0, core_1.parseNum)(t[1]) : 200000 });
    }
    if (cmd === "pause")
        return send("pause");
    if (cmd === "time")
        return send("getTimeState");
    if (cmd === "where") {
        if (!t[1])
            throw new Error(`Invalid where command: ${line}`);
        return send("resolveAddress", { addr: (0, core_1.parseNum)(t[1]) & 0xffff });
    }
    if (cmd === "loc") {
        if (!t[1] || !t[2])
            throw new Error(`Invalid loc command: ${line}`);
        const file = t[1];
        const lineNo = (0, core_1.parseNum)(t[2]);
        const column = t[3] ? (0, core_1.parseNum)(t[3]) : undefined;
        return send("resolveLocation", column != null ? { file, line: lineNo, column } : { file, line: lineNo });
    }
    if (cmd === "mem" || cmd === "d") {
        const addr = t[1] ? (0, core_1.parseNum)(t[1]) : 0;
        const len = t[2] ? (0, core_1.parseNum)(t[2]) : 64;
        return send("readMemory", { addr, len });
    }
    if (cmd === "write" || cmd === "wm") {
        if (!t[1] || !t[2])
            throw new Error(`Invalid write command: ${line}`);
        const addr = (0, core_1.parseNum)(t[1]);
        const data = parseBytes(t.slice(2).join(" "));
        return send("writeMemory", { addr, data });
    }
    if (cmd === "readport" || cmd === "inp") {
        if (!t[1])
            throw new Error(`Invalid readport command: ${line}`);
        return send("readPort", { port: (0, core_1.parseNum)(t[1]) & 0xffff });
    }
    if (cmd === "writeport" || cmd === "outp") {
        if (!t[1] || !t[2])
            throw new Error(`Invalid writeport command: ${line}`);
        return send("writePort", { port: (0, core_1.parseNum)(t[1]) & 0xffff, value: (0, core_1.parseNum)(t[2]) & 0xff });
    }
    throw new Error(`Unknown command: ${line}`);
}
async function runRemoteScript(client, script) {
    const commands = script
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    for (const c of commands) {
        const keep = await runRemoteCommand(client, c);
        if (!keep)
            break;
    }
}
async function runRemoteRepl(client) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "dbg-remote> ",
    });
    rl.prompt();
    for await (const line of rl) {
        try {
            const keep = await runRemoteCommand(client, line);
            if (!keep)
                break;
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(msg);
        }
        rl.prompt();
    }
    rl.close();
}
