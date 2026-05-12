"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPegSource = runPegSource;
exports.runPegFile = runPegFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../../logger");
const mz80_as_1 = require("../../cli/mz80-as");
function formatError(err) {
    if (!err)
        return "";
    const msg = err?.message ? String(err.message) : String(err);
    const loc = err?.location ?? err?.loc ?? err?.pos;
    if (loc && typeof loc === "object") {
        const line = loc.start?.line ?? loc.line ?? (loc.parent ? loc.parent.line : undefined);
        const column = loc.start?.column ?? loc.column;
        if (line !== undefined && column !== undefined) {
            return `${msg} (line ${line}, column ${column})`;
        }
    }
    return msg;
}
function readIfExists(p) {
    if (!fs_1.default.existsSync(p))
        return undefined;
    return fs_1.default.readFileSync(p, "utf-8");
}
function runOnce(name, src, tag, outDir, opts, virtualFiles) {
    const logger = (0, logger_1.createLogger)("quiet");
    const relPath = path_1.default.join(outDir, `${name}.${tag}.rel`);
    const options = {
        relVersion: opts?.relVersion ?? 2,
        virtualFiles,
    };
    const tmpAsm = path_1.default.join(outDir, `${name}.${tag}.asm`);
    fs_1.default.writeFileSync(tmpAsm, src, "utf-8");
    try {
        const ctx = (0, mz80_as_1.assemble)(logger, tmpAsm, relPath, options);
        return {
            errors: ctx.errors.map(e => `${e.code}:${e.message}`),
            warnings: ctx.warnings.map(w => `${w.code}:${w.message}`),
            outputs: {
                rel: readIfExists(relPath),
                lst: readIfExists(relPath.replace(/\.rel$/i, ".lst")),
                sym: readIfExists(relPath.replace(/\.rel$/i, ".sym")),
            },
        };
    }
    catch (err) {
        return {
            errors: [],
            warnings: [],
            outputs: {},
            exception: formatError(err),
        };
    }
    finally {
        try {
            fs_1.default.unlinkSync(tmpAsm);
        }
        catch {
            /* ignore */
        }
    }
}
function runFileOnce(name, inputFile, tag, outDir, opts) {
    const logger = (0, logger_1.createLogger)("quiet");
    const relPath = path_1.default.join(outDir, `${name}.${tag}.rel`);
    const options = {
        relVersion: opts?.relVersion ?? 2,
    };
    try {
        const ctx = (0, mz80_as_1.assemble)(logger, inputFile, relPath, options);
        return {
            errors: ctx.errors.map(e => `${e.code}:${e.message}`),
            warnings: ctx.warnings.map(w => `${w.code}:${w.message}`),
            outputs: {
                rel: readIfExists(relPath),
                lst: readIfExists(relPath.replace(/\.rel$/i, ".lst")),
                sym: readIfExists(relPath.replace(/\.rel$/i, ".sym")),
            },
        };
    }
    catch (err) {
        return {
            errors: [],
            warnings: [],
            outputs: {},
            exception: String(err?.message ?? err),
        };
    }
}
function ensureDir(p) {
    if (!fs_1.default.existsSync(p))
        fs_1.default.mkdirSync(p, { recursive: true });
}
function makeRunDir(label) {
    const root = path_1.default.join(process.cwd(), ".tmp_peg_compare");
    ensureDir(root);
    const safe = label.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48);
    const prefix = path_1.default.join(root, `run_${safe}_`);
    return fs_1.default.mkdtempSync(prefix);
}
function runPegSource(name, src, opts, virtualFiles) {
    const base = makeRunDir(`runPegSource_${name}`);
    const peg = runOnce(name, src, "peg", base, opts, virtualFiles);
    if (!opts?.keepTemp) {
        try {
            fs_1.default.rmSync(base, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    }
    return peg;
}
function runPegFile(name, inputFile, opts) {
    const base = makeRunDir(`runPegFile_${name}`);
    const peg = runFileOnce(name, inputFile, "peg", base, opts);
    if (!opts?.keepTemp) {
        try {
            fs_1.default.rmSync(base, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    }
    return peg;
}
