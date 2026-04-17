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
exports.CpmBdos = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core_1 = require("./core");
class CpmBdos {
    env;
    handles = new Map();
    searchResults = [];
    searchIndex = 0;
    constructor(env) {
        this.env = env;
    }
    setRootDir(rootDir) {
        this.env.rootDir = rootDir;
    }
    setTrace(trace) {
        this.env.trace = trace;
    }
    traceLog(text) {
        if (!this.env.trace)
            return;
        console.error(`[BDOS] ${text}`);
    }
    traceExtra(fn, state) {
        if (fn === 10) {
            const addr = this.fcbAddr(state);
            const maxLen = this.env.read8(addr) & 0xff;
            return ` buf=${(0, core_1.formatHex)(addr)} max=${maxLen}`;
        }
        if (fn === 26) {
            const dma = ((state.d & 0xff) << 8) | (state.e & 0xff);
            return ` dma=${(0, core_1.formatHex)(dma)}`;
        }
        if (fn === 15 || fn === 16 || fn === 17 || fn === 19 || fn === 20 || fn === 21 || fn === 22 || fn === 23 || fn === 33 || fn === 34 || fn === 35 || fn === 36) {
            const info = this.readFcb(this.fcbAddr(state));
            if (!info)
                return " fcb=(invalid)";
            return ` fcb=${this.buildHostName(info)}`;
        }
        return "";
    }
    handle(fn, state) {
        const beforeA = state.a & 0xff;
        const de = ((state.d & 0xff) << 8) | (state.e & 0xff);
        const traceThisCall = fn !== 6;
        if (traceThisCall) {
            this.traceLog(`IN fn=${fn} C=${(0, core_1.formatHex)(state.c, 2)} DE=${(0, core_1.formatHex)(de)} A=${(0, core_1.formatHex)(beforeA, 2)}${this.traceExtra(fn, state)}`);
        }
        let stop;
        switch (fn) {
            case 0:
                stop = "BDOS 0: terminate";
                break;
            case 1:
                // Console input: blocking in interactive mode, CR in non-interactive mode.
                if (this.env.interactive?.() && this.env.readConsoleChar) {
                    state.a = this.env.readConsoleChar(true) ?? 0x0d;
                }
                else {
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
                    const ch = (this.env.interactive?.() && this.env.readConsoleChar)
                        ? this.env.readConsoleChar(false)
                        : undefined;
                    state.a = ch == null ? 0x00 : (ch & 0xff);
                }
                else {
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
                state.a = 0x00;
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
            default:
                state.a = 0x00;
                break;
        }
        if (traceThisCall) {
            this.traceLog(`OUT fn=${fn} A=${(0, core_1.formatHex)(state.a, 2)}${stop ? ` stop=${stop}` : ""}`);
        }
        return stop;
    }
    writeDollarString(state) {
        let p = ((state.d & 0xff) << 8) | (state.e & 0xff);
        let guard = 0;
        while (guard++ < 0x10000) {
            const ch = this.env.read8(p++);
            if (ch === 0x24)
                break;
            this.env.output(String.fromCharCode(ch));
        }
    }
    readBufferedConsole(state) {
        const addr = this.fcbAddr(state);
        const maxLen = this.env.read8(addr) & 0xff;
        if (this.env.interactive?.() && this.env.readConsoleLine) {
            const line = this.env.readConsoleLine(maxLen);
            const bytes = Buffer.from(line, "ascii");
            const len = Math.min(maxLen, bytes.length);
            this.env.write8(addr + 1, len & 0xff);
            for (let i = 0; i < len; i++)
                this.env.write8(addr + 2 + i, bytes[i] & 0x7f);
            this.env.write8(addr + 2 + len, 0x0d);
        }
        else {
            // Non-interactive default: empty line (CR only).
            this.env.write8(addr + 1, 0x00);
            if (maxLen > 0) {
                this.env.write8(addr + 2, 0x0d);
            }
        }
    }
    fcbAddr(state) {
        return ((state.d & 0xff) << 8) | (state.e & 0xff);
    }
    decodeFcbChar(v) {
        const x = v & 0x7f;
        if (x === 0x00)
            return " ";
        if (x === 0x3f)
            return "?";
        if (x < 0x20 || x > 0x7e)
            return " ";
        return String.fromCharCode(x);
    }
    readFcb(addr) {
        const drive = this.env.read8(addr);
        if (drive === 0xe5)
            return null;
        const nameChars = [];
        const extChars = [];
        let hasWildcard = false;
        for (let i = 0; i < 8; i++) {
            const v = this.env.read8(addr + 1 + i);
            if (v === 0x3f)
                hasWildcard = true;
            nameChars.push(this.decodeFcbChar(v));
        }
        for (let i = 0; i < 3; i++) {
            const v = this.env.read8(addr + 9 + i);
            if (v === 0x3f)
                hasWildcard = true;
            extChars.push(this.decodeFcbChar(v));
        }
        const name = nameChars.join("").trim();
        const ext = extChars.join("").trim();
        if (!name)
            return null;
        return { name: name.toUpperCase(), ext: ext.toUpperCase(), hasWildcard };
    }
    buildHostName(info) {
        const safe = (s) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
        const name = safe(info.name);
        const ext = safe(info.ext);
        return ext ? `${name}.${ext}` : name;
    }
    listMatching(pattern) {
        const root = this.env.rootDir;
        if (!fs.existsSync(root))
            return [];
        const entries = fs.readdirSync(root);
        const re = this.patternToRegex(pattern);
        return entries.filter((e) => re.test(e.toUpperCase()));
    }
    patternToRegex(pattern) {
        const name = (pattern.name + "        ").slice(0, 8);
        const ext = (pattern.ext + "   ").slice(0, 3);
        const toRe = (s) => s
            .split("")
            .map((c) => (c === "?" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
            .join("");
        return new RegExp(`^${toRe(name).trim()}(\\.${toRe(ext).trim()})?$`, "i");
    }
    writeDirEntry(file) {
        const dma = this.env.getDma();
        const parts = file.toUpperCase().split(".");
        const name = (parts[0] ?? "").padEnd(8, " ").slice(0, 8);
        const ext = (parts[1] ?? "").padEnd(3, " ").slice(0, 3);
        this.env.write8(dma, 0);
        for (let i = 0; i < 8; i++)
            this.env.write8(dma + 1 + i, name.charCodeAt(i));
        for (let i = 0; i < 3; i++)
            this.env.write8(dma + 9 + i, ext.charCodeAt(i));
        for (let i = 12; i < 32; i++)
            this.env.write8(dma + i, 0);
    }
    openFile(state) {
        const info = this.readFcb(this.fcbAddr(state));
        if (!info || info.hasWildcard)
            return false;
        const hostName = this.buildHostName(info);
        const fullPath = path.join(this.env.rootDir, hostName);
        if (!fs.existsSync(fullPath))
            return false;
        const fd = fs.openSync(fullPath, "r+");
        this.handles.set(hostName, { name: hostName, fd, pos: 0 });
        return true;
    }
    closeFile(state) {
        const info = this.readFcb(this.fcbAddr(state));
        if (!info)
            return false;
        const hostName = this.buildHostName(info);
        const handle = this.handles.get(hostName);
        if (!handle)
            return false;
        fs.closeSync(handle.fd);
        this.handles.delete(hostName);
        return true;
    }
    makeFile(state) {
        const info = this.readFcb(this.fcbAddr(state));
        if (!info || info.hasWildcard)
            return false;
        const hostName = this.buildHostName(info);
        const fullPath = path.join(this.env.rootDir, hostName);
        const fd = fs.openSync(fullPath, "w+");
        this.handles.set(hostName, { name: hostName, fd, pos: 0 });
        return true;
    }
    renameFile(state) {
        const addr = this.fcbAddr(state);
        const newInfo = this.readFcb(addr);
        const oldInfo = this.readFcb(addr + 16);
        if (!newInfo || !oldInfo)
            return false;
        if (newInfo.hasWildcard || oldInfo.hasWildcard)
            return false;
        const oldName = this.buildHostName(oldInfo);
        const newName = this.buildHostName(newInfo);
        const oldPath = path.join(this.env.rootDir, oldName);
        const newPath = path.join(this.env.rootDir, newName);
        if (!fs.existsSync(oldPath))
            return false;
        fs.renameSync(oldPath, newPath);
        return true;
    }
    deleteFiles(state) {
        const info = this.readFcb(this.fcbAddr(state));
        if (!info)
            return false;
        const matches = this.listMatching(info);
        if (matches.length === 0)
            return false;
        for (const file of matches) {
            const p = path.join(this.env.rootDir, file);
            try {
                fs.unlinkSync(p);
            }
            catch { }
        }
        return true;
    }
    searchFirst(state) {
        const info = this.readFcb(this.fcbAddr(state));
        if (!info)
            return false;
        this.searchResults = this.listMatching(info);
        this.searchIndex = 0;
        return this.searchNext(state);
    }
    searchNext(_state) {
        if (this.searchIndex >= this.searchResults.length)
            return false;
        const file = this.searchResults[this.searchIndex++];
        this.writeDirEntry(file);
        return true;
    }
    getHandleFor(state) {
        const info = this.readFcb(this.fcbAddr(state));
        if (!info)
            return null;
        const hostName = this.buildHostName(info);
        return this.handles.get(hostName) ?? null;
    }
    readSequential(state) {
        const handle = this.getHandleFor(state);
        if (!handle)
            return 0xff;
        const buf = Buffer.alloc(128);
        const bytes = fs.readSync(handle.fd, buf, 0, 128, handle.pos);
        handle.pos += bytes;
        const dma = this.env.getDma();
        for (let i = 0; i < 128; i++)
            this.env.write8(dma + i, buf[i] ?? 0);
        return bytes === 0 ? 0x01 : 0x00;
    }
    writeSequential(state) {
        const handle = this.getHandleFor(state);
        if (!handle)
            return 0xff;
        const dma = this.env.getDma();
        const buf = Buffer.alloc(128);
        for (let i = 0; i < 128; i++)
            buf[i] = this.env.read8(dma + i);
        fs.writeSync(handle.fd, buf, 0, 128, handle.pos);
        handle.pos += 128;
        return 0x00;
    }
    readRandom(state) {
        const handle = this.getHandleFor(state);
        if (!handle)
            return 0xff;
        const addr = this.fcbAddr(state);
        const rec = this.env.read8(addr + 33) | (this.env.read8(addr + 34) << 8) | (this.env.read8(addr + 35) << 16);
        handle.pos = rec * 128;
        return this.readSequential(state);
    }
    writeRandom(state) {
        const handle = this.getHandleFor(state);
        if (!handle)
            return 0xff;
        const addr = this.fcbAddr(state);
        const rec = this.env.read8(addr + 33) | (this.env.read8(addr + 34) << 8) | (this.env.read8(addr + 35) << 16);
        handle.pos = rec * 128;
        return this.writeSequential(state);
    }
    computeFileSize(state) {
        const info = this.readFcb(this.fcbAddr(state));
        if (!info)
            return false;
        const hostName = this.buildHostName(info);
        const fullPath = path.join(this.env.rootDir, hostName);
        if (!fs.existsSync(fullPath))
            return false;
        const size = fs.statSync(fullPath).size;
        const records = Math.ceil(size / 128);
        const addr = this.fcbAddr(state);
        this.env.write8(addr + 33, records & 0xff);
        this.env.write8(addr + 34, (records >> 8) & 0xff);
        this.env.write8(addr + 35, (records >> 16) & 0xff);
        return true;
    }
    setRandomRecord(state) {
        const handle = this.getHandleFor(state);
        if (!handle)
            return false;
        const records = Math.floor(handle.pos / 128);
        const addr = this.fcbAddr(state);
        this.env.write8(addr + 33, records & 0xff);
        this.env.write8(addr + 34, (records >> 8) & 0xff);
        this.env.write8(addr + 35, (records >> 16) & 0xff);
        return true;
    }
}
exports.CpmBdos = CpmBdos;
