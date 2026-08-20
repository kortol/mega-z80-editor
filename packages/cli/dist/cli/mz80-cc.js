"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileSccProgramFromCli = compileSccProgramFromCli;
const node_path_1 = __importDefault(require("node:path"));
const compileProgram_1 = require("../scc/compileProgram");
const compilerAdapter_1 = require("../scc/compilerAdapter");
const tsCompilerAdapter_1 = require("../scc/tsCompilerAdapter");
function compileSccProgramFromCli(logger, inputFile, outputFile, opts) {
    const resolvedOutput = node_path_1.default.resolve(outputFile);
    const defaultCom = /\.com$/i.test(resolvedOutput);
    const compilerAdapter = opts.compiler === "ts"
        ? new tsCompilerAdapter_1.TsSccCompilerAdapter()
        : new compilerAdapter_1.ExternalSccCompilerAdapter({
            dcppPath: opts.dcpp,
            sccz80Path: opts.sccz80,
            toolMode: opts.wsl ? "wsl" : "host",
        });
    (0, compileProgram_1.compileSccProgram)(logger, {
        inputFile: node_path_1.default.resolve(inputFile),
        outputFile: resolvedOutput,
        includeDirs: opts.include ?? [],
        cppArgs: opts.cppArg ?? [],
        sccArgs: opts.sccArg ?? [],
        dcppPath: opts.dcpp,
        sccz80Path: opts.sccz80,
        tempDir: opts.tempDir ? node_path_1.default.resolve(opts.tempDir) : undefined,
        keepTemps: opts.keepTemps,
        verbose: opts.verbose,
        toolMode: opts.wsl ? "wsl" : "host",
        runtime: opts.runtime,
        libraries: opts.library ?? [],
        com: opts.com ?? defaultCom,
        orgText: opts.orgText ?? (defaultCom ? "100H" : undefined),
        orgData: opts.orgData,
        orgBss: opts.orgBss,
        orgCustom: opts.orgCustom,
        map: opts.map,
        sym: opts.sym,
        smap: opts.smap,
        log: opts.log,
        fullpath: opts.fullpath,
    }, {
        compilerAdapter,
    });
}
