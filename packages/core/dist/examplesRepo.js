"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXAMPLES_REPO_NAME = exports.EXAMPLES_DIR_ENV = void 0;
exports.getExamplesRepoCandidates = getExamplesRepoCandidates;
exports.resolveExamplesRepoDir = resolveExamplesRepoDir;
exports.resolveExamplesPath = resolveExamplesPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.EXAMPLES_DIR_ENV = "MZ80_EXAMPLES_DIR";
exports.EXAMPLES_REPO_NAME = "mega-z80-examples";
function getExamplesRepoCandidates(repoRoot) {
    const envDir = process.env[exports.EXAMPLES_DIR_ENV]?.trim();
    const dirs = [
        envDir ? path_1.default.resolve(envDir) : null,
        path_1.default.resolve(repoRoot, "..", exports.EXAMPLES_REPO_NAME),
        path_1.default.resolve(repoRoot, "examples"),
    ].filter((value) => !!value);
    return [...new Set(dirs)];
}
function resolveExamplesRepoDir(repoRoot) {
    return getExamplesRepoCandidates(repoRoot).find((dir) => fs_1.default.existsSync(dir)) ?? null;
}
function resolveExamplesPath(repoRoot, ...segments) {
    for (const dir of getExamplesRepoCandidates(repoRoot)) {
        const full = path_1.default.join(dir, ...segments);
        if (fs_1.default.existsSync(full))
            return full;
    }
    return null;
}
