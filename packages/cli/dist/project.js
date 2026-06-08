"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProjectConfig = loadProjectConfig;
exports.listProjectTargets = listProjectTargets;
exports.resolveProjectTarget = resolveProjectTarget;
exports.buildProjectTarget = buildProjectTarget;
exports.cleanProject = cleanProject;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const mz80_as_1 = require("./cli/mz80-as");
const mz80_link_1 = require("./cli/mz80-link");
const compileProgram_1 = require("./scc/compileProgram");
const compilerAdapter_1 = require("./scc/compilerAdapter");
const runtime_1 = require("./scc/runtime");
const externalToolchain_1 = require("./scc/externalToolchain");
const translateAsm_1 = require("./scc/translateAsm");
function loadProjectConfig(configPath, logger) {
    try {
        if (!fs_1.default.existsSync(configPath))
            return {};
        const content = fs_1.default.readFileSync(configPath, "utf-8");
        return (yaml_1.default.parse(content) ?? {});
    }
    catch (err) {
        logger?.warn?.(`Failed to load config: ${err?.message ?? err}`);
        return {};
    }
}
function listProjectTargets(cfg) {
    return cfg.targets ? Object.keys(cfg.targets) : [];
}
function resolveProjectTarget(configPath, cfg, requestedTarget) {
    const configDir = path_1.default.dirname(configPath);
    const targetNames = listProjectTargets(cfg);
    if (targetNames.length === 0) {
        throw new Error("No targets defined in mz80.yaml");
    }
    const targetName = requestedTarget
        ?? cfg.project?.defaultTarget
        ?? (targetNames.length === 1 ? targetNames[0] : undefined);
    if (!targetName) {
        throw new Error(`Multiple targets found. Specify one explicitly: ${targetNames.join(", ")}`);
    }
    const raw = cfg.targets?.[targetName];
    if (!raw) {
        throw new Error(`Unknown target: ${targetName}`);
    }
    const modules = raw.modules.map((entry) => {
        if (typeof entry === "string") {
            return {
                source: path_1.default.resolve(configDir, entry),
                object: path_1.default.resolve(configDir, deriveObjectPath(raw.output, entry)),
                kind: resolveModuleKind(entry),
            };
        }
        return {
            source: path_1.default.resolve(configDir, entry.source),
            object: path_1.default.resolve(configDir, entry.object && entry.object.trim().length > 0
                ? entry.object
                : deriveObjectPath(raw.output, entry.source)),
            kind: resolveModuleKind(entry.source),
        };
    });
    const mergedCc = mergeCcOptions({
        runtime: raw.runtime,
        libraries: raw.libraries,
    }, mergeCcOptions(cfg.cc, raw.cc));
    const runtimeName = mergedCc?.runtime ?? raw.runtime;
    return {
        name: targetName,
        output: path_1.default.resolve(configDir, raw.output),
        modules,
        runtime: runtimeName
            ? resolveRuntimePaths(configDir, raw.output, runtimeName, raw.runtimeObject)
            : undefined,
        libraries: (mergedCc?.libraries ?? raw.libraries ?? []).map((entry) => path_1.default.resolve(configDir, entry)),
        cc: mergedCc
            ? {
                ...mergedCc,
                tempDir: mergedCc.tempDir ? path_1.default.resolve(configDir, mergedCc.tempDir) : undefined,
                includeDirs: (mergedCc.includeDirs ?? []).map((entry) => path_1.default.resolve(configDir, entry)),
            }
            : undefined,
        as: mergeAsOptions(cfg.as, raw.as),
        link: mergeLinkOptions(cfg.link, raw.link),
    };
}
function buildProjectTarget(configPath, cfg, requestedTarget, logger, overrides) {
    const target = applyBuildOverrides(resolveProjectTarget(configPath, cfg, requestedTarget), configPath, overrides);
    const tempDir = target.cc?.tempDir
        ? path_1.default.resolve(target.cc.tempDir)
        : path_1.default.join(path_1.default.dirname(target.output), `.mz80-scc-${target.name}`);
    const compilerAdapter = new compilerAdapter_1.ExternalSccCompilerAdapter({
        dcppPath: target.cc?.dcpp,
        sccz80Path: target.cc?.sccz80,
        toolMode: target.cc?.toolMode ?? "host",
        tracePipeline: target.cc?.tracePipeline,
    });
    if (target.runtime) {
        fs_1.default.mkdirSync(path_1.default.dirname(target.runtime.source), { recursive: true });
        fs_1.default.writeFileSync(target.runtime.source, (0, runtime_1.getBundledSccRuntime)(target.runtime.name), "utf8");
        fs_1.default.writeFileSync(target.runtime.asm, (0, translateAsm_1.translateSccAsm)(fs_1.default.readFileSync(target.runtime.source, "utf8"), { moduleName: target.runtime.name }), "utf8");
        (0, mz80_as_1.assemble)(logger, target.runtime.asm, target.runtime.object, {
            ...(target.as ?? {}),
            relVersion: normalizeRelVersion(target.as?.relVersion),
            symLen: normalizeSymLen(target.as?.symLen),
            includePaths: (target.as?.includePaths ?? []).map((p) => path_1.default.resolve(path_1.default.dirname(configPath), p)),
            verbose: false,
        });
    }
    try {
        for (const mod of target.modules) {
            fs_1.default.mkdirSync(path_1.default.dirname(mod.object), { recursive: true });
            if (mod.kind === "c") {
                (0, compileProgram_1.compileSccSourceToRel)(logger, {
                    inputFile: mod.source,
                    outputRelFile: mod.object,
                    includeDirs: target.cc?.includeDirs ?? [],
                    cppArgs: target.cc?.cppArgs ?? [],
                    sccArgs: target.cc?.sccArgs ?? [],
                    tempDir,
                    verbose: false,
                    sym: !!target.link?.sym,
                    smap: !!target.link?.smap,
                }, compilerAdapter);
                continue;
            }
            (0, mz80_as_1.assemble)(logger, mod.source, mod.object, {
                ...(target.as ?? {}),
                relVersion: normalizeRelVersion(target.as?.relVersion),
                symLen: normalizeSymLen(target.as?.symLen),
                includePaths: (target.as?.includePaths ?? []).map((p) => path_1.default.resolve(path_1.default.dirname(configPath), p)),
                verbose: false,
            });
        }
        fs_1.default.mkdirSync(path_1.default.dirname(target.output), { recursive: true });
        (0, mz80_link_1.link)([
            ...(target.runtime ? [target.runtime.object] : []),
            ...target.modules.map((mod) => mod.object),
            ...target.libraries,
        ], target.output, target.link ?? {});
        return target;
    }
    finally {
        if (!target.cc?.keepTemps && !target.cc?.tempDir) {
            (0, externalToolchain_1.safeRmDir)(tempDir);
        }
    }
}
function cleanProject(configPath, cfg) {
    const configDir = path_1.default.dirname(configPath);
    const patterns = cfg.project?.clean?.files ?? [];
    if (patterns.length === 0) {
        throw new Error("No clean patterns defined in mz80.yaml");
    }
    const removed = new Set();
    for (const pattern of patterns) {
        if (!isSafeCleanPattern(pattern)) {
            throw new Error(`Unsafe clean pattern rejected: ${pattern}`);
        }
        for (const match of expandPattern(configDir, pattern)) {
            if (!fs_1.default.existsSync(match))
                continue;
            const stat = fs_1.default.statSync(match);
            if (!stat.isFile())
                continue;
            fs_1.default.unlinkSync(match);
            removed.add(path_1.default.resolve(match));
        }
    }
    return [...removed].sort((a, b) => a.localeCompare(b));
}
function deriveObjectPath(targetOutput, sourcePath) {
    const outDir = path_1.default.dirname(targetOutput);
    const base = path_1.default.basename(sourcePath).replace(/\.[^.]+$/, ".rel");
    return path_1.default.join(outDir, base);
}
function resolveRuntimePaths(configDir, targetOutput, runtimeName, runtimeObject) {
    const objectPath = path_1.default.resolve(configDir, runtimeObject && runtimeObject.trim().length > 0
        ? runtimeObject
        : path_1.default.join(path_1.default.dirname(targetOutput), `${runtimeName}.rel`));
    const basePath = objectPath.replace(/\.rel$/i, "");
    return {
        name: runtimeName,
        source: `${basePath}.scc.asm`,
        asm: `${basePath}.asm`,
        object: objectPath,
    };
}
function mergeAsOptions(base, override) {
    if (!base && !override)
        return undefined;
    return {
        ...(base ?? {}),
        ...(override ?? {}),
        includePaths: override?.includePaths ?? base?.includePaths,
    };
}
function mergeLinkOptions(base, override) {
    if (!base && !override)
        return undefined;
    return {
        ...(base ?? {}),
        ...(override ?? {}),
    };
}
function mergeCcOptions(base, override) {
    if (!base && !override)
        return undefined;
    return {
        ...(base ?? {}),
        ...(override ?? {}),
        libraries: override?.libraries ?? base?.libraries,
        includeDirs: override?.includeDirs ?? base?.includeDirs,
        cppArgs: override?.cppArgs ?? base?.cppArgs,
        sccArgs: override?.sccArgs ?? base?.sccArgs,
    };
}
function applyBuildOverrides(target, configPath, overrides) {
    if (!overrides)
        return target;
    const configDir = path_1.default.dirname(configPath);
    const mergedCc = mergeCcOptions(target.cc, overrides.cc);
    const runtimeName = overrides.runtime ?? target.runtime?.name;
    return {
        ...target,
        runtime: runtimeName
            ? resolveRuntimePaths(configDir, target.output, runtimeName, target.runtime?.object)
            : undefined,
        libraries: (overrides.libraries ?? target.libraries).map((entry) => path_1.default.resolve(configDir, entry)),
        cc: mergedCc
            ? {
                ...mergedCc,
                tempDir: mergedCc.tempDir ? path_1.default.resolve(configDir, mergedCc.tempDir) : undefined,
                includeDirs: (mergedCc.includeDirs ?? []).map((entry) => path_1.default.resolve(configDir, entry)),
                libraries: (mergedCc.libraries ?? []).map((entry) => path_1.default.resolve(configDir, entry)),
            }
            : undefined,
    };
}
function normalizeRelVersion(value) {
    if (value === undefined)
        return 2;
    return String(value) === "2" ? 2 : 1;
}
function normalizeSymLen(value) {
    if (value === undefined)
        return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}
function resolveModuleKind(sourcePath) {
    return /\.c$/i.test(sourcePath) ? "c" : "asm";
}
function expandPattern(rootDir, pattern) {
    const normalized = pattern.replace(/\\/g, "/");
    if (!/[*?]/.test(normalized)) {
        return [path_1.default.resolve(rootDir, normalized)];
    }
    const regex = wildcardToRegExp(normalized);
    const results = [];
    walkFiles(rootDir, rootDir, regex, results);
    return results;
}
function walkFiles(baseDir, currentDir, regex, out) {
    for (const entry of fs_1.default.readdirSync(currentDir, { withFileTypes: true })) {
        const abs = path_1.default.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(baseDir, abs, regex, out);
            continue;
        }
        if (!entry.isFile())
            continue;
        const rel = path_1.default.relative(baseDir, abs).replace(/\\/g, "/");
        if (regex.test(rel) || regex.test(entry.name)) {
            out.push(abs);
        }
    }
}
function wildcardToRegExp(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regexText = `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`;
    return new RegExp(regexText, "i");
}
function isSafeCleanPattern(pattern) {
    const normalized = String(pattern ?? "").trim().replace(/\\/g, "/");
    if (!normalized)
        return false;
    if (path_1.default.isAbsolute(normalized))
        return false;
    if (normalized.includes(".."))
        return false;
    if (normalized.includes("**"))
        return false;
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length === 0)
        return false;
    if (segments.some((segment) => /^[*?]+$/.test(segment)))
        return false;
    const basename = segments[segments.length - 1];
    if (/^[*?]+$/.test(basename))
        return false;
    if (!/[*?]/.test(basename))
        return true;
    return /[A-Za-z0-9_.-]/.test(basename.replace(/[*?]/g, ""));
}
