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
function compileCFile(logger, options) {
    return new tsCompilerAdapter_1.TsSccCompilerAdapter().compileToRel(logger, options);
}
function compileCSource(logger, options) {
    const inputFile = node_path_1.default.resolve(options.tempDir, options.fileName ?? "source.c");
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(inputFile), { recursive: true });
    node_fs_1.default.writeFileSync(inputFile, options.source, "utf8");
    return compileCFile(logger, { ...options, inputFile });
}
