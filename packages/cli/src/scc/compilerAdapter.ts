import fs from "node:fs";
import path from "node:path";
import { assemble } from "../cli/mz80-as";
import { Logger } from "../logger";
import { translateSccAsm } from "./translateAsm";
import {
  buildCppArgs,
  defaultRunTool,
  findGeneratedSccAsm,
  prepareToolchainIncludeDirs,
  RunTool,
  ToolMode,
} from "./externalToolchain";

type AssembleFile = typeof assemble;

export type CompileSccSourceResult = {
  inputFile: string;
  preprocessedFile: string;
  sccAsmFile: string;
  asmFile: string;
  relFile: string;
  stageDir: string;
};

export type CompilerAdapterCompileOptions = {
  inputFile: string;
  tempDir: string;
  outputRelFile?: string;
  includeDirs?: string[];
  cppArgs?: string[];
  sccArgs?: string[];
  verbose?: boolean;
  sym?: boolean;
  smap?: boolean;
};

export interface CompilerAdapter {
  compileToRel(logger: Logger, opts: CompilerAdapterCompileOptions): CompileSccSourceResult;
}

export type ExternalSccCompilerAdapterOptions = {
  dcppPath?: string;
  sccz80Path?: string;
  toolMode?: ToolMode;
  runTool?: RunTool;
  assembleFile?: AssembleFile;
  tracePipeline?: boolean;
};

export class ExternalSccCompilerAdapter implements CompilerAdapter {
  private readonly dcppPath: string;
  private readonly sccz80Path: string;
  private readonly toolMode: ToolMode;
  private readonly runTool: RunTool;
  private readonly assembleFile: AssembleFile;
  private readonly tracePipeline: boolean;

  constructor(opts: ExternalSccCompilerAdapterOptions = {}) {
    this.dcppPath = opts.dcppPath ?? "dcpp";
    this.sccz80Path = opts.sccz80Path ?? "sccz80";
    this.toolMode = opts.toolMode ?? "host";
    this.runTool = opts.runTool ?? defaultRunTool;
    this.assembleFile = opts.assembleFile ?? assemble;
    this.tracePipeline = !!opts.tracePipeline;
  }

  compileToRel(logger: Logger, opts: CompilerAdapterCompileOptions): CompileSccSourceResult {
    const resolvedInput = path.resolve(opts.inputFile);
    const stageRoot = path.resolve(opts.tempDir);
    const stem = sanitizeStageStem(path.basename(resolvedInput, path.extname(resolvedInput)).toLowerCase());
    const stageDir = path.join(stageRoot, stem);
    fs.mkdirSync(stageDir, { recursive: true });
    const includeDirs = prepareToolchainIncludeDirs(stageRoot, this.toolMode, opts.includeDirs ?? []);
    const preprocessedFile = path.join(stageDir, `${stem}.i`);
    const preArg = this.toolMode === "wsl" ? path.basename(preprocessedFile) : preprocessedFile;
    const sccAsmFile = path.join(stageDir, `${stem}.scc.asm`);
    const asmFile = path.join(stageDir, `${stem}.asm`);
    const relFile = opts.outputRelFile ? path.resolve(opts.outputRelFile) : path.join(stageDir, `${stem}.rel`);

    const dcppArgs = [...buildCppArgs(includeDirs, opts.cppArgs), resolvedInput, preArg];
    const sccArgs = [...(opts.sccArgs ?? []), preArg];
    trace(logger, this.tracePipeline, `SCC stage dir: ${stageDir}`);
    trace(logger, this.tracePipeline, `SCC preprocess: ${formatToolInvocation(this.dcppPath, dcppArgs, this.toolMode)}`);
    try {
      this.runTool(
        this.dcppPath,
        dcppArgs,
        stageDir,
        this.toolMode,
      );
    } catch (error: any) {
      throw new Error(`SCC preprocess failed for ${resolvedInput}: ${error?.message ?? error}`);
    }

    trace(logger, this.tracePipeline, `SCC compile: ${formatToolInvocation(this.sccz80Path, sccArgs, this.toolMode)}`);
    try {
      this.runTool(
        this.sccz80Path,
        sccArgs,
        stageDir,
        this.toolMode,
      );
    } catch (error: any) {
      throw new Error(`SCC compile failed for ${resolvedInput}: ${error?.message ?? error}`);
    }

    let generatedAsmPath: string;
    try {
      generatedAsmPath = findGeneratedSccAsm(stageDir, stem);
    } catch (error: any) {
      throw new Error(`SCC asm discovery failed for ${resolvedInput}: ${error?.message ?? error}`);
    }
    const translated = translateSccAsmFromFile(generatedAsmPath, sccAsmFile);
    trace(logger, this.tracePipeline, `SCC translate: ${generatedAsmPath} -> ${translated.asmFile}`);
    fs.mkdirSync(path.dirname(relFile), { recursive: true });
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

export function compileSccSourceToRel(
  logger: Logger,
  opts: CompilerAdapterCompileOptions,
  adapter: CompilerAdapter,
): CompileSccSourceResult {
  return adapter.compileToRel(logger, opts);
}

function translateSccAsmFromFile(
  generatedAsmPath: string,
  sccAsmFile: string,
): { sccAsmFile: string; asmFile: string } {
  const asmFile = sccAsmFile.replace(/\.scc\.asm$/i, ".asm");
  const source = generatedAsmPath === sccAsmFile
    ? sccAsmFile
    : copyAsm(generatedAsmPath, sccAsmFile);
  const translated = translateSccAsm(fs.readFileSync(source, "utf8"), {
    moduleName: path.basename(source),
  });
  fs.writeFileSync(asmFile, translated, "utf8");
  return {
    sccAsmFile: source,
    asmFile,
  };
}

function copyAsm(inputPath: string, outputPath: string): string {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(inputPath, outputPath);
  return outputPath;
}

function trace(logger: Logger, enabled: boolean, message: string): void {
  if (!enabled) return;
  logger.info(message);
}

function formatToolInvocation(command: string, args: string[], toolMode: ToolMode): string {
  return toolMode === "wsl"
    ? `wsl ${command} ${args.join(" ")}`
    : `${command} ${args.join(" ")}`;
}

function sanitizeStageStem(stem: string): string {
  return stem.replace(/[^a-z0-9_.$@]/gi, "_");
}
