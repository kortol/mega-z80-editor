"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MSX_RUNTIME_EXIT_MODES = exports.BUNDLED_RUNTIME_PROFILES = exports.BUNDLED_RUNTIME_PLATFORMS = exports.SCC_RUNTIME_NAMES = void 0;
exports.isSccRuntimeName = isSccRuntimeName;
exports.isBundledRuntimeSpec = isBundledRuntimeSpec;
exports.normalizeBundledRuntime = normalizeBundledRuntime;
exports.runtimeId = runtimeId;
exports.getBundledRuntimeDefines = getBundledRuntimeDefines;
exports.getBundledRuntimeIncludeDir = getBundledRuntimeIncludeDir;
exports.getBundledRuntimeIncludeDirs = getBundledRuntimeIncludeDirs;
exports.getBundledSccRuntime = getBundledSccRuntime;
exports.writeBundledSccRuntime = writeBundledSccRuntime;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const runtimeLibrary_1 = require("./runtimeLibrary");
const runtimeFeatures_1 = require("./runtimeFeatures");
exports.SCC_RUNTIME_NAMES = ["cpmcrt", "cpmlibc"];
exports.BUNDLED_RUNTIME_PLATFORMS = ["cpm", "msx-bios", "raw"];
exports.BUNDLED_RUNTIME_PROFILES = ["lite", "full"];
exports.MSX_RUNTIME_EXIT_MODES = ["halt", "return"];
function isSccRuntimeName(value) {
    return typeof value === "string" && exports.SCC_RUNTIME_NAMES.includes(value);
}
function isBundledRuntimeSpec(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    try {
        (0, runtimeFeatures_1.normalizeNumericFeatures)(candidate.features);
    }
    catch {
        return false;
    }
    return exports.BUNDLED_RUNTIME_PLATFORMS.includes(candidate.platform ?? "") &&
        exports.BUNDLED_RUNTIME_PROFILES.includes(candidate.profile ?? "") &&
        (candidate.exit === undefined || exports.MSX_RUNTIME_EXIT_MODES.includes(candidate.exit));
}
function normalizeBundledRuntime(selection) {
    if (typeof selection !== "string") {
        if (selection.platform !== "msx-bios" && selection.exit !== undefined) {
            throw new Error(`Runtime exit mode is valid only for msx-bios, got ${selection.platform}.`);
        }
        const features = (0, runtimeFeatures_1.normalizeNumericFeatures)(selection.features);
        const normalized = { ...selection, ...(selection.features !== undefined ? { features } : {}) };
        return selection.platform === "msx-bios" ? { ...normalized, exit: selection.exit ?? "halt" } : normalized;
    }
    if (selection === "cpmcrt")
        return { platform: "cpm", profile: "lite" };
    // cpmlibc remains a link-compatible legacy runtime rather than a full profile.
    return { platform: "cpm", profile: "lite" };
}
function runtimeId(selection) {
    if (typeof selection === "string")
        return selection;
    const normalized = normalizeBundledRuntime(selection);
    return normalized.platform === "msx-bios"
        ? `${normalized.platform}-${normalized.profile}-${normalized.exit}`
        : `${normalized.platform}-${normalized.profile}`;
}
function getBundledRuntimeDefines(selection) {
    const spec = normalizeBundledRuntime(selection);
    const defines = {
        [`MZ80_PLATFORM_${spec.platform.replace(/-/g, "_").toUpperCase()}`]: "1",
        [`MZ80_RUNTIME_${spec.profile.toUpperCase()}`]: "1",
    };
    if (spec.platform === "msx-bios") {
        defines[`MZ80_MSX_EXIT_${(spec.exit ?? "halt").toUpperCase()}`] = "1";
    }
    for (const feature of (0, runtimeFeatures_1.requireNumericFeatures)(spec.features))
        defines[`MZ80_FEATURE_${feature.toUpperCase()}`] = "1";
    return defines;
}
function getBundledRuntimeIncludeDir() {
    return node_path_1.default.join(__dirname, "runtime", "include");
}
function getBundledRuntimeIncludeDirs(selection) {
    const features = (0, runtimeFeatures_1.requireNumericFeatures)(normalizeBundledRuntime(selection).features);
    const root = node_fs_1.default.existsSync(node_path_1.default.join(__dirname, "runtime", "numeric", "available.json"))
        ? node_path_1.default.join(__dirname, "runtime") : node_path_1.default.resolve(__dirname, "../../dist/scc/runtime");
    return [getBundledRuntimeIncludeDir(), ...features.map((feature) => node_path_1.default.join(root, "numeric", feature, "include"))];
}
function runtimeFilePath(selection) {
    if (typeof selection === "string")
        return node_path_1.default.join(__dirname, "runtime", "legacy", `${selection}.scc.asm`);
    const spec = normalizeBundledRuntime(selection);
    return node_path_1.default.join(__dirname, "runtime", "platform", `${spec.platform}-${spec.profile === "full" ? "lite" : spec.profile}.scc.asm`);
}
function getBundledSccRuntime(selection) {
    let source = node_fs_1.default.readFileSync(runtimeFilePath(selection), "utf8");
    if (typeof selection !== "string" && selection.profile === "full") {
        source += `\n${(0, runtimeLibrary_1.readFullRuntimeSource)(node_path_1.default.join(__dirname, "runtime", "lib"))}`;
    }
    if (typeof selection !== "string") {
        for (const feature of (0, runtimeFeatures_1.requireNumericFeatures)(selection.features)) {
            const root = getBundledRuntimeIncludeDirs(selection).find((entry) => entry.endsWith(node_path_1.default.join(feature, "include")));
            source += "\n" + node_fs_1.default.readFileSync(node_path_1.default.join(root, "..", "constructors.scc.asm"), "utf8");
            source += "\n" + node_fs_1.default.readFileSync(node_path_1.default.join(root, "..", "cpu.scc.asm"), "utf8");
            for (const name of runtimeFeatures_1.NUMERIC_C_MEMBERS)
                source += "\n" + node_fs_1.default.readFileSync(node_path_1.default.join(root, "..", `${name}.generated.scc.asm`), "utf8");
        }
    }
    if (typeof selection === "string" || selection.platform !== "msx-bios")
        return source;
    const exit = normalizeBundledRuntime(selection).exit === "return"
        ? "\tret"
        : ".halt_loop:\n\thalt\n\tjr\t.halt_loop";
    return source.replace("{{MSX_EXIT}}", exit);
}
function writeBundledSccRuntime(selection, outputFile) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(outputFile), { recursive: true });
    node_fs_1.default.writeFileSync(outputFile, getBundledSccRuntime(selection), "utf8");
}
