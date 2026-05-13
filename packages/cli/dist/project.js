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
            };
        }
        return {
            source: path_1.default.resolve(configDir, entry.source),
            object: path_1.default.resolve(configDir, entry.object && entry.object.trim().length > 0
                ? entry.object
                : deriveObjectPath(raw.output, entry.source)),
        };
    });
    return {
        name: targetName,
        output: path_1.default.resolve(configDir, raw.output),
        modules,
        as: mergeAsOptions(cfg.as, raw.as),
        link: mergeLinkOptions(cfg.link, raw.link),
    };
}
function buildProjectTarget(configPath, cfg, requestedTarget, logger) {
    const target = resolveProjectTarget(configPath, cfg, requestedTarget);
    for (const mod of target.modules) {
        fs_1.default.mkdirSync(path_1.default.dirname(mod.object), { recursive: true });
        (0, mz80_as_1.assemble)(logger, mod.source, mod.object, {
            ...(target.as ?? {}),
            relVersion: normalizeRelVersion(target.as?.relVersion),
            symLen: normalizeSymLen(target.as?.symLen),
            includePaths: (target.as?.includePaths ?? []).map((p) => path_1.default.resolve(path_1.default.dirname(configPath), p)),
            verbose: false,
        });
    }
    fs_1.default.mkdirSync(path_1.default.dirname(target.output), { recursive: true });
    (0, mz80_link_1.link)(target.modules.map((mod) => mod.object), target.output, target.link ?? {});
    return target;
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
function normalizeRelVersion(value) {
    if (value === undefined)
        return undefined;
    return String(value) === "2" ? 2 : 1;
}
function normalizeSymLen(value) {
    if (value === undefined)
        return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
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
