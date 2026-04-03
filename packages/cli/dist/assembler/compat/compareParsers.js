"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareSource = compareSource;
exports.compareFile = compareFile;
exports.runPegSource = runPegSource;
exports.runPegFile = runPegFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../../logger");
const mz80_as_1 = require("../../cli/mz80-as");
function readIfExists(p) {
    if (!fs_1.default.existsSync(p))
        return undefined;
    return fs_1.default.readFileSync(p, "utf-8");
}
function runOnce(name, src, mode, outDir, opts, virtualFiles) {
    const logger = (0, logger_1.createLogger)("quiet");
    const relPath = path_1.default.join(outDir, `${name}.${mode}.rel`);
    const options = {
        relVersion: opts?.relVersion ?? 2,
        parser: mode,
        virtualFiles,
    };
    const tmpAsm = path_1.default.join(outDir, `${name}.${mode}.asm`);
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
            exception: String(err?.message ?? err),
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
function runFileOnce(name, inputFile, mode, outDir, opts) {
    const logger = (0, logger_1.createLogger)("quiet");
    const relPath = path_1.default.join(outDir, `${name}.${mode}.rel`);
    const options = {
        relVersion: opts?.relVersion ?? 2,
        parser: mode,
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
function compareSource(name, src, opts, virtualFiles) {
    const base = path_1.default.join(process.cwd(), ".tmp_peg_compare");
    ensureDir(base);
    const legacy = runOnce(name, src, "legacy", base, opts, virtualFiles);
    const peg = runOnce(name, src, "peg", base, opts, virtualFiles);
    if (!opts?.keepTemp) {
        try {
            fs_1.default.rmSync(base, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    }
    return { name, legacy, peg };
}
function compareFile(name, inputFile, opts) {
    const base = path_1.default.join(process.cwd(), ".tmp_peg_compare");
    ensureDir(base);
    const legacy = runFileOnce(name, inputFile, "legacy", base, opts);
    const peg = runFileOnce(name, inputFile, "peg", base, opts);
    if (!opts?.keepTemp) {
        try {
            fs_1.default.rmSync(base, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    }
    return { name, legacy, peg };
}
function runPegSource(name, src, opts, virtualFiles) {
    const base = path_1.default.join(process.cwd(), ".tmp_peg_compare");
    ensureDir(base);
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
    const base = path_1.default.join(process.cwd(), ".tmp_peg_compare");
    ensureDir(base);
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
