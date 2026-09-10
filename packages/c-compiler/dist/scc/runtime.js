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
exports.getBundledSccRuntime = getBundledSccRuntime;
exports.writeBundledSccRuntime = writeBundledSccRuntime;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
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
    return exports.BUNDLED_RUNTIME_PLATFORMS.includes(candidate.platform ?? "") &&
        exports.BUNDLED_RUNTIME_PROFILES.includes(candidate.profile ?? "") &&
        (candidate.exit === undefined || exports.MSX_RUNTIME_EXIT_MODES.includes(candidate.exit));
}
function normalizeBundledRuntime(selection) {
    if (typeof selection !== "string") {
        if (selection.platform !== "msx-bios" && selection.exit !== undefined) {
            throw new Error(`Runtime exit mode is valid only for msx-bios, got ${selection.platform}.`);
        }
        return selection.platform === "msx-bios" ? { ...selection, exit: selection.exit ?? "halt" } : { ...selection };
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
    return defines;
}
function getBundledRuntimeIncludeDir() {
    return node_path_1.default.join(__dirname, "runtime", "include");
}
function runtimeFilePath(selection) {
    if (typeof selection === "string")
        return node_path_1.default.join(__dirname, "runtime", `${selection}.scc.asm`);
    const spec = normalizeBundledRuntime(selection);
    return node_path_1.default.join(__dirname, "runtime", `${spec.platform}-${spec.profile === "full" ? "lite" : spec.profile}.scc.asm`);
}
function getBundledSccRuntime(selection) {
    let source = node_fs_1.default.readFileSync(runtimeFilePath(selection), "utf8");
    if (typeof selection !== "string" && selection.profile === "full") {
        source += `\n${node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "runtime", "full.scc.asm"), "utf8")}`;
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
