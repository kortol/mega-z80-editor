"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCC_RUNTIME_NAMES = void 0;
exports.getBundledSccRuntime = getBundledSccRuntime;
exports.writeBundledSccRuntime = writeBundledSccRuntime;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
exports.SCC_RUNTIME_NAMES = ["cpmcrt", "cpmlibc"];
function runtimeFilePath(name) {
    return node_path_1.default.join(__dirname, "runtime", `${name}.scc.asm`);
}
function getBundledSccRuntime(name) {
    return node_fs_1.default.readFileSync(runtimeFilePath(name), "utf8");
}
function writeBundledSccRuntime(name, outputFile) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(outputFile), { recursive: true });
    node_fs_1.default.copyFileSync(runtimeFilePath(name), outputFile);
}
