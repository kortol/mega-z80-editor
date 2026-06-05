"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileSccSourceToRel = void 0;
exports.compileSccProgram = compileSccProgram;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const mz80_as_1 = require("../cli/mz80-as");
const mz80_link_1 = require("../cli/mz80-link");
const compilerAdapter_1 = require("./compilerAdapter");
const externalToolchain_1 = require("./externalToolchain");
const runtime_1 = require("./runtime");
const translateAsm_1 = require("./translateAsm");
var compilerAdapter_2 = require("./compilerAdapter");
Object.defineProperty(exports, "compileSccSourceToRel", { enumerable: true, get: function () { return compilerAdapter_2.compileSccSourceToRel; } });
function compileSccProgram(logger, opts, deps = {}) {
    const assembleFile = deps.assembleFile ?? mz80_as_1.assemble;
    const linkFiles = deps.linkFiles ?? mz80_link_1.link;
    const compilerAdapter = deps.compilerAdapter ?? new compilerAdapter_1.ExternalSccCompilerAdapter({
        dcppPath: opts.dcppPath,
        sccz80Path: opts.sccz80Path,
        toolMode: opts.toolMode,
        assembleFile,
    });
    const comMode = !!opts.com || /\.com$/i.test(opts.outputFile);
    const tempDir = opts.tempDir
        ? node_path_1.default.resolve(opts.tempDir)
        : node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "mz80-scc-cc-"));
    node_fs_1.default.mkdirSync(tempDir, { recursive: true });
    let runtimeRelFile;
    try {
        const compiled = (0, compilerAdapter_1.compileSccSourceToRel)(logger, {
            inputFile: opts.inputFile,
            includeDirs: opts.includeDirs,
            cppArgs: opts.cppArgs,
            sccArgs: opts.sccArgs,
            tempDir,
            verbose: opts.verbose,
            sym: opts.sym,
            smap: opts.smap,
        }, compilerAdapter);
        const linkInputs = [];
        if (opts.runtime) {
            runtimeRelFile = buildBundledRuntime(logger, tempDir, opts.runtime, opts.verbose, assembleFile);
            linkInputs.push(runtimeRelFile);
        }
        linkInputs.push(compiled.relFile, ...(opts.libraries ?? []).map((entry) => node_path_1.default.resolve(entry)));
        linkFiles(linkInputs, node_path_1.default.resolve(opts.outputFile), {
            verbose: opts.verbose,
            map: opts.map,
            sym: opts.sym,
            smap: opts.smap,
            log: opts.log,
            com: comMode,
            orgText: opts.orgText ?? (comMode ? "100H" : undefined),
            orgData: opts.orgData,
            orgBss: opts.orgBss,
            orgCustom: opts.orgCustom,
            fullpath: opts.fullpath,
        });
        logger.info(`Built SCC program: ${opts.inputFile} -> ${opts.outputFile}`);
        return {
            outputFile: node_path_1.default.resolve(opts.outputFile),
            relFile: compiled.relFile,
            runtimeRelFile,
            tempDir,
        };
    }
    catch (error) {
        if (!opts.keepTemps && !opts.tempDir) {
            (0, externalToolchain_1.safeRmDir)(tempDir);
        }
        throw error;
    }
}
function buildBundledRuntime(logger, tempDir, runtimeName, verbose, assembleFile) {
    const runtimeSourcePath = node_path_1.default.join(tempDir, `${runtimeName}.scc.asm`);
    const runtimeAsmPath = node_path_1.default.join(tempDir, `${runtimeName}.asm`);
    const runtimeRelPath = node_path_1.default.join(tempDir, `${runtimeName}.rel`);
    node_fs_1.default.writeFileSync(runtimeSourcePath, (0, runtime_1.getBundledSccRuntime)(runtimeName), "utf8");
    node_fs_1.default.writeFileSync(runtimeAsmPath, (0, translateAsm_1.translateSccAsm)(node_fs_1.default.readFileSync(runtimeSourcePath, "utf8"), { moduleName: runtimeName }), "utf8");
    const runtimeCtx = assembleFile(logger, runtimeAsmPath, runtimeRelPath, {
        relVersion: 2,
        verbose,
    });
    if (runtimeCtx.errors.length > 0) {
        throw new Error(`Assembly failed for bundled runtime ${runtimeName}: ${runtimeCtx.errors.map((e) => e.message).join("; ")}`);
    }
    return runtimeRelPath;
}
