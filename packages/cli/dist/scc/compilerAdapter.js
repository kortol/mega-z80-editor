"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalSccCompilerAdapter = void 0;
exports.compileSccSourceToRel = compileSccSourceToRel;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const mz80_as_1 = require("../cli/mz80-as");
const translateAsm_1 = require("./translateAsm");
const externalToolchain_1 = require("./externalToolchain");
class ExternalSccCompilerAdapter {
    dcppPath;
    sccz80Path;
    toolMode;
    runTool;
    assembleFile;
    tracePipeline;
    constructor(opts = {}) {
        this.dcppPath = opts.dcppPath ?? "dcpp";
        this.sccz80Path = opts.sccz80Path ?? "sccz80";
        this.toolMode = opts.toolMode ?? "host";
        this.runTool = opts.runTool ?? externalToolchain_1.defaultRunTool;
        this.assembleFile = opts.assembleFile ?? mz80_as_1.assemble;
        this.tracePipeline = !!opts.tracePipeline;
    }
    compileToRel(logger, opts) {
        const resolvedInput = node_path_1.default.resolve(opts.inputFile);
        const stageRoot = node_path_1.default.resolve(opts.tempDir);
        const stem = sanitizeStageStem(node_path_1.default.basename(resolvedInput, node_path_1.default.extname(resolvedInput)).toLowerCase());
        const stageDir = node_path_1.default.join(stageRoot, stem);
        node_fs_1.default.mkdirSync(stageDir, { recursive: true });
        const includeDirs = (0, externalToolchain_1.prepareToolchainIncludeDirs)(stageRoot, this.toolMode, opts.includeDirs ?? []);
        const preprocessedFile = node_path_1.default.join(stageDir, `${stem}.i`);
        const preArg = this.toolMode === "wsl" ? node_path_1.default.basename(preprocessedFile) : preprocessedFile;
        const sccAsmFile = node_path_1.default.join(stageDir, `${stem}.scc.asm`);
        const asmFile = node_path_1.default.join(stageDir, `${stem}.asm`);
        const relFile = opts.outputRelFile ? node_path_1.default.resolve(opts.outputRelFile) : node_path_1.default.join(stageDir, `${stem}.rel`);
        const dcppArgs = [...(0, externalToolchain_1.buildCppArgs)(includeDirs, opts.cppArgs), resolvedInput, preArg];
        const sccArgs = [...(opts.sccArgs ?? []), preArg];
        trace(logger, this.tracePipeline, `SCC stage dir: ${stageDir}`);
        trace(logger, this.tracePipeline, `SCC preprocess: ${formatToolInvocation(this.dcppPath, dcppArgs, this.toolMode)}`);
        try {
            this.runTool(this.dcppPath, dcppArgs, stageDir, this.toolMode);
        }
        catch (error) {
            throw new Error(`SCC preprocess failed for ${resolvedInput}: ${error?.message ?? error}`);
        }
        trace(logger, this.tracePipeline, `SCC compile: ${formatToolInvocation(this.sccz80Path, sccArgs, this.toolMode)}`);
        try {
            this.runTool(this.sccz80Path, sccArgs, stageDir, this.toolMode);
        }
        catch (error) {
            throw new Error(`SCC compile failed for ${resolvedInput}: ${error?.message ?? error}`);
        }
        let generatedAsmPath;
        try {
            generatedAsmPath = (0, externalToolchain_1.findGeneratedSccAsm)(stageDir, stem);
        }
        catch (error) {
            throw new Error(`SCC asm discovery failed for ${resolvedInput}: ${error?.message ?? error}`);
        }
        const translated = translateSccAsmFromFile(generatedAsmPath, sccAsmFile);
        trace(logger, this.tracePipeline, `SCC translate: ${generatedAsmPath} -> ${translated.asmFile}`);
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(relFile), { recursive: true });
        const ctx = this.assembleFile(logger, translated.asmFile, relFile, {
            relVersion: 2,
            verbose: opts.verbose,
            sym: opts.sym,
            lst: false,
            smap: opts.smap,
        });
        if (ctx.errors.length > 0) {
            throw new Error(`Assembly failed for ${resolvedInput}: ${ctx.errors.map((e) => e.message).join("; ")}`);
        }
        return {
            inputFile: resolvedInput,
            preprocessedFile,
            sccAsmFile: translated.sccAsmFile,
            asmFile: translated.asmFile,
            relFile,
            stageDir,
        };
    }
}
exports.ExternalSccCompilerAdapter = ExternalSccCompilerAdapter;
function compileSccSourceToRel(logger, opts, adapter) {
    return adapter.compileToRel(logger, opts);
}
function translateSccAsmFromFile(generatedAsmPath, sccAsmFile) {
    const asmFile = sccAsmFile.replace(/\.scc\.asm$/i, ".asm");
    const source = generatedAsmPath === sccAsmFile
        ? sccAsmFile
        : copyAsm(generatedAsmPath, sccAsmFile);
    const translated = (0, translateAsm_1.translateSccAsm)(node_fs_1.default.readFileSync(source, "utf8"), {
        moduleName: node_path_1.default.basename(source),
    });
    node_fs_1.default.writeFileSync(asmFile, translated, "utf8");
    return {
        sccAsmFile: source,
        asmFile,
    };
}
function copyAsm(inputPath, outputPath) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(outputPath), { recursive: true });
    node_fs_1.default.copyFileSync(inputPath, outputPath);
    return outputPath;
}
function trace(logger, enabled, message) {
    if (!enabled)
        return;
    logger.info(message);
}
function formatToolInvocation(command, args, toolMode) {
    return toolMode === "wsl"
        ? `wsl ${command} ${args.join(" ")}`
        : `${command} ${args.join(" ")}`;
}
function sanitizeStageStem(stem) {
    return stem.replace(/[^a-z0-9_.$@]/gi, "_");
}
