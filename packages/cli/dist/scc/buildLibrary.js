"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSccLibrary = buildSccLibrary;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const archive_1 = require("../linker/archive");
const externalToolchain_1 = require("./externalToolchain");
const compilerAdapter_1 = require("./compilerAdapter");
function buildSccLibrary(logger, opts, deps = {}) {
    const archiveFiles = deps.archiveFiles ?? archive_1.createArchive;
    const compilerAdapter = deps.compilerAdapter ?? new compilerAdapter_1.ExternalSccCompilerAdapter({
        dcppPath: opts.dcppPath,
        sccz80Path: opts.sccz80Path,
        toolMode: opts.toolMode,
    });
    const tempDir = opts.tempDir
        ? node_path_1.default.resolve(opts.tempDir)
        : node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "mz80-scc-lib-"));
    node_fs_1.default.mkdirSync(tempDir, { recursive: true });
    const relFiles = [];
    try {
        for (const inputFile of opts.inputFiles) {
            const compiled = compilerAdapter.compileToRel(logger, {
                inputFile,
                tempDir,
                includeDirs: opts.includeDirs,
                cppArgs: opts.cppArgs,
                sccArgs: opts.sccArgs,
                verbose: opts.verbose,
            });
            relFiles.push(compiled.relFile);
        }
        const archivePath = node_path_1.default.resolve(opts.outputFile);
        archiveFiles(relFiles, archivePath);
        logger.info(`Built SCC library: ${archivePath}`);
        return { archivePath, relFiles, tempDir };
    }
    catch (error) {
        if (!opts.keepTemps && !opts.tempDir) {
            (0, externalToolchain_1.safeRmDir)(tempDir);
        }
        throw error;
    }
}
