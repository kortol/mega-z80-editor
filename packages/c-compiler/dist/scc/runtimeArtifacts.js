"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBundledRuntimeArtifacts = getBundledRuntimeArtifacts;
exports.buildBundledRuntimeArtifacts = buildBundledRuntimeArtifacts;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const assembler_1 = require("@mz80/assembler");
const core_1 = require("@mz80/core");
const runtime_1 = require("./runtime");
const runtimeLibrary_1 = require("./runtimeLibrary");
const translateAsm_1 = require("./translateAsm");
const rawHooks = ["__mz80_raw_putc", "__mz80_raw_getc", "__mz80_raw_exit"];
function artifactRoot() {
    // Published code runs from dist/scc. Source-path tests run from src/scc but
    // intentionally consume the artifacts produced by the package build.
    const packaged = node_path_1.default.join(__dirname, "runtime", "artifacts");
    return node_fs_1.default.existsSync(packaged)
        ? packaged
        : node_path_1.default.resolve(__dirname, "../../dist/scc/runtime/artifacts");
}
function crtName(selection) {
    const spec = (0, runtime_1.normalizeBundledRuntime)(selection);
    if (spec.platform === "msx-bios") {
        return `msx-bios-lite-${spec.exit ?? "halt"}-crt.rel`;
    }
    // The full profile supplies its C library through libmz80c-full.lib; CRT
    // startup and platform I/O remain the corresponding lite CRT.
    return `${spec.platform}-lite-crt.rel`;
}
/** Returns installed, prebuilt link inputs for a structured runtime selection. */
function getBundledRuntimeArtifacts(selection) {
    if (typeof selection === "string") {
        throw new Error(`Legacy runtime ${selection} has no prebuilt archive artifacts.`);
    }
    const spec = (0, runtime_1.normalizeBundledRuntime)(selection);
    const root = artifactRoot();
    const crtRelPath = node_path_1.default.join(root, crtName(selection));
    const libraryPaths = spec.profile === "full" ? [node_path_1.default.join(root, "libmz80c-full.lib")] : [];
    const requiredSymbols = spec.platform === "raw" ? rawHooks : undefined;
    for (const artifact of [crtRelPath, ...libraryPaths]) {
        if (!node_fs_1.default.existsSync(artifact))
            throw new Error(`Bundled runtime artifact is missing: ${artifact}`);
    }
    return { crtRelPath, libraryPaths, requiredSymbols };
}
function assembleRuntime(source, moduleName, output) {
    const tempAsm = output.replace(/\.rel$/i, ".asm");
    node_fs_1.default.writeFileSync(tempAsm, (0, translateAsm_1.translateSccAsm)(source, { moduleName }), "utf8");
    const result = (0, assembler_1.assemble)((0, core_1.createLogger)("quiet"), tempAsm, output, { relVersion: 2 });
    node_fs_1.default.rmSync(tempAsm, { force: true });
    if (result.errors.length)
        throw new Error(`Assembly failed for runtime artifact ${moduleName}: ${result.errors.map((error) => error.message).join("; ")}`);
}
function withPublicHelpers(source) {
    return `${source}\n\t.globl\tmz80_runtime_gchar\n\t.globl\tmz80_runtime_gint\nmz80_runtime_gchar:\n\tjp\t.gchar\nmz80_runtime_gint:\n\tjp\t.gint\n`;
}
function libraryModule(source, exports, externs) {
    return [
        ...exports.map((symbol) => `\t.globl\t${symbol}`),
        ...externs.map((symbol) => `\tEXTERN\t${symbol}`),
        "\t.area\t_CODE",
        source,
    ].join("\n");
}
/** Invoked after TypeScript compilation to make deterministic distributable runtime artifacts. */
function buildBundledRuntimeArtifacts() {
    const root = artifactRoot();
    node_fs_1.default.mkdirSync(root, { recursive: true });
    const runtimeRoot = node_path_1.default.join(__dirname, "runtime");
    const platformRoot = node_path_1.default.join(runtimeRoot, "platform");
    const libraryRoot = node_path_1.default.join(runtimeRoot, "lib");
    const cpmLite = node_fs_1.default.readFileSync(node_path_1.default.join(platformRoot, "cpm-lite.scc.asm"), "utf8");
    const msxLite = node_fs_1.default.readFileSync(node_path_1.default.join(platformRoot, "msx-bios-lite.scc.asm"), "utf8");
    const rawLite = node_fs_1.default.readFileSync(node_path_1.default.join(platformRoot, "raw-lite.scc.asm"), "utf8");
    assembleRuntime(withPublicHelpers(cpmLite), "cpm-lite-crt", node_path_1.default.join(root, "cpm-lite-crt.rel"));
    assembleRuntime(withPublicHelpers(msxLite.replace("{{MSX_EXIT}}", ".halt_loop:\n\thalt\n\tjr\t.halt_loop")), "msx-bios-lite-halt-crt", node_path_1.default.join(root, "msx-bios-lite-halt-crt.rel"));
    assembleRuntime(withPublicHelpers(msxLite.replace("{{MSX_EXIT}}", "\tret")), "msx-bios-lite-return-crt", node_path_1.default.join(root, "msx-bios-lite-return-crt.rel"));
    assembleRuntime(withPublicHelpers(rawLite), "raw-lite-crt", node_path_1.default.join(root, "raw-lite-crt.rel"));
    const modules = runtimeLibrary_1.FULL_RUNTIME_LIBRARY_MODULES.map((module) => ({
        ...module,
        source: node_fs_1.default.readFileSync(node_path_1.default.join(libraryRoot, module.file), "utf8"),
    }));
    const moduleRelFiles = modules.map(({ name }) => node_path_1.default.join(root, `${name}.rel`));
    try {
        modules.forEach((module, index) => {
            const source = libraryModule(module.source, module.exports, module.externs)
                .replace(/\.gchar\b/g, "mz80_runtime_gchar")
                .replace(/\.gint\b/g, "mz80_runtime_gint");
            assembleRuntime(source, module.name, moduleRelFiles[index]);
        });
        (0, core_1.createArchive)(moduleRelFiles, node_path_1.default.join(root, "libmz80c-full.lib"));
    }
    finally {
        for (const relFile of moduleRelFiles)
            node_fs_1.default.rmSync(relFile, { force: true });
    }
}
