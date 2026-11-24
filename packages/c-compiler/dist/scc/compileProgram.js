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
const assembler_1 = require("@mz80/assembler");
const core_1 = require("@mz80/core");
const startup_1 = require("./startup");
const compilerAdapter_1 = require("./compilerAdapter");
const externalToolchain_1 = require("./externalToolchain");
const runtime_1 = require("./runtime");
const runtimeArtifacts_1 = require("./runtimeArtifacts");
const translateAsm_1 = require("./translateAsm");
const abiLinkCheck_1 = require("./abiLinkCheck");
const tsCompilerAdapter_1 = require("./tsCompilerAdapter");
var compilerAdapter_2 = require("./compilerAdapter");
Object.defineProperty(exports, "compileSccSourceToRel", { enumerable: true, get: function () { return compilerAdapter_2.compileSccSourceToRel; } });
function compileSccProgram(logger, opts, deps = {}) {
    const assembleFile = deps.assembleFile ?? assembler_1.assemble;
    const linkFiles = deps.linkFiles ?? core_1.link;
    const compilerAdapter = deps.compilerAdapter ?? new compilerAdapter_1.ExternalSccCompilerAdapter({
        dcppPath: opts.dcppPath,
        sccz80Path: opts.sccz80Path,
        toolMode: opts.toolMode,
        assembleFile,
    });
    if (opts.runtime && (0, runtime_1.normalizeBundledRuntime)(opts.runtime).features?.length && !(compilerAdapter instanceof tsCompilerAdapter_1.TsSccCompilerAdapter)) {
        throw new Error("Numeric runtime features require the TS compiler");
    }
    const configured = opts.memory && opts.startup !== false;
    if (opts.startup !== undefined && opts.startup !== false && !opts.memory)
        throw new Error("startup requires memory layout");
    if (configured && (!(compilerAdapter instanceof tsCompilerAdapter_1.TsSccCompilerAdapter) || !opts.runtime || typeof opts.runtime === "string"))
        throw new Error("configured startup requires TS compiler and structured runtime");
    const comMode = !!opts.com || /\.com$/i.test(opts.outputFile);
    const tempDir = opts.tempDir
        ? node_path_1.default.resolve(opts.tempDir)
        : node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "mz80-scc-cc-"));
    node_fs_1.default.mkdirSync(tempDir, { recursive: true });
    let runtimeRelFile;
    try {
        const runtimeDefines = opts.runtime ? (0, runtime_1.getBundledRuntimeDefines)(opts.runtime) : undefined;
        const compiled = (0, compilerAdapter_1.compileSccSourceToRel)(logger, {
            inputFile: opts.inputFile,
            includeDirs: opts.includeDirs,
            cppArgs: opts.cppArgs,
            sccArgs: opts.sccArgs,
            tempDir,
            verbose: opts.verbose,
            sym: opts.sym,
            smap: opts.smap,
            defines: runtimeDefines,
            bundledIncludeDirs: opts.runtime ? (0, runtime_1.getBundledRuntimeIncludeDirs)(opts.runtime) : [],
            runtimeFeatures: opts.runtime ? (0, runtime_1.normalizeBundledRuntime)(opts.runtime).features : [],
            startupEntry: configured ? (opts.startup && opts.startup.entry) || "main" : undefined,
        }, compilerAdapter);
        const linkInputs = [];
        let requiredSymbols;
        if (opts.runtime) {
            if (typeof opts.runtime === "string") {
                runtimeRelFile = buildBundledRuntime(logger, tempDir, opts.runtime, opts.verbose, assembleFile);
                linkInputs.push(runtimeRelFile);
            }
            else {
                const artifacts = (0, runtimeArtifacts_1.getBundledRuntimeArtifacts)(opts.runtime);
                runtimeRelFile = artifacts.crtRelPath;
                if (configured)
                    runtimeRelFile = (0, startup_1.buildConfiguredStartup)(opts.runtime, opts.memory, opts.startup || {}, compilerAdapter.abiProfile, tempDir);
                linkInputs.push(runtimeRelFile, ...artifacts.libraryPaths);
                requiredSymbols = artifacts.requiredSymbols;
            }
        }
        linkInputs.push(compiled.relFile, ...(opts.libraries ?? []).map((entry) => node_path_1.default.resolve(entry)));
        (0, abiLinkCheck_1.validateTsAbiLinkInputs)(linkInputs);
        linkFiles(linkInputs, node_path_1.default.resolve(opts.outputFile), {
            verbose: opts.verbose,
            map: opts.map,
            sym: opts.sym,
            smap: opts.smap,
            log: opts.log,
            com: comMode,
            orgText: opts.orgText ?? (comMode && !opts.memory ? "100H" : undefined),
            orgData: opts.orgData,
            orgBss: opts.orgBss,
            orgCustom: opts.orgCustom,
            fullpath: opts.fullpath,
            requireSymbols: requiredSymbols,
            memory: opts.memory,
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
    const runtimeNameId = (0, runtime_1.runtimeId)(runtimeName);
    const runtimeSourcePath = node_path_1.default.join(tempDir, `${runtimeNameId}.scc.asm`);
    const runtimeAsmPath = node_path_1.default.join(tempDir, `${runtimeNameId}.asm`);
    const runtimeRelPath = node_path_1.default.join(tempDir, `${runtimeNameId}.rel`);
    node_fs_1.default.writeFileSync(runtimeSourcePath, (0, runtime_1.getBundledSccRuntime)(runtimeName), "utf8");
    node_fs_1.default.writeFileSync(runtimeAsmPath, (0, translateAsm_1.translateSccAsm)(node_fs_1.default.readFileSync(runtimeSourcePath, "utf8"), { moduleName: runtimeNameId }), "utf8");
    const runtimeCtx = assembleFile(logger, runtimeAsmPath, runtimeRelPath, {
        relVersion: 2,
        verbose,
    });
    if (runtimeCtx.errors.length > 0) {
        throw new Error(`Assembly failed for bundled runtime ${runtimeName}: ${runtimeCtx.errors.map((e) => e.message).join("; ")}`);
    }
    return runtimeRelPath;
}
