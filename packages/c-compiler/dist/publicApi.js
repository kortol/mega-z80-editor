"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileCFile = compileCFile;
exports.compileCSource = compileCSource;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const tsCompilerAdapter_1 = require("./scc/tsCompilerAdapter");
const runtime_1 = require("./scc/runtime");
function compileCFile(logger, options) {
    const runtime = { platform: "raw", profile: "lite", features: options.features };
    return new tsCompilerAdapter_1.TsSccCompilerAdapter({ abi: options.abi }).compileToRel(logger, {
        ...options,
        ...(options.features !== undefined ? {
            runtimeFeatures: options.features,
            bundledIncludeDirs: (0, runtime_1.getBundledRuntimeIncludeDirs)(runtime),
            defines: Object.fromEntries(Object.entries((0, runtime_1.getBundledRuntimeDefines)(runtime)).filter(([name]) => name.startsWith("MZ80_FEATURE_"))),
        } : {}),
    });
}
function compileCSource(logger, options) {
    const inputFile = node_path_1.default.resolve(options.tempDir, options.fileName ?? "source.c");
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(inputFile), { recursive: true });
    node_fs_1.default.writeFileSync(inputFile, options.source, "utf8");
    return compileCFile(logger, { ...options, inputFile });
}
