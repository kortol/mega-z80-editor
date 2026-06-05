import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../cli/mz80-as";
import { link } from "../cli/mz80-link";
import { Logger } from "../logger";
import {
  compileSccSourceToRel,
  CompilerAdapter,
  ExternalSccCompilerAdapter,
  ExternalSccCompilerAdapterOptions,
} from "./compilerAdapter";
import { safeRmDir } from "./externalToolchain";
import { getBundledSccRuntime, SccRuntimeName } from "./runtime";
import { translateSccAsm } from "./translateAsm";

type AssembleFile = typeof assemble;
type LinkFiles = typeof link;

export type CompileSccProgramOptions = {
  inputFile: string;
  outputFile: string;
  includeDirs?: string[];
  cppArgs?: string[];
  sccArgs?: string[];
  dcppPath?: string;
  sccz80Path?: string;
  tempDir?: string;
  keepTemps?: boolean;
  verbose?: boolean;
  toolMode?: ExternalSccCompilerAdapterOptions["toolMode"];
  runtime?: SccRuntimeName;
  libraries?: string[];
  com?: boolean;
  orgText?: string | number;
  orgData?: string | number;
  orgBss?: string | number;
  orgCustom?: string | number;
  map?: boolean;
  sym?: boolean;
  smap?: boolean;
  log?: boolean;
  fullpath?: "off" | "rel" | "on" | boolean | string;
};

type CompileDeps = {
  compilerAdapter?: CompilerAdapter;
  assembleFile?: AssembleFile;
  linkFiles?: LinkFiles;
};

export { compileSccSourceToRel } from "./compilerAdapter";
export type { CompileSccSourceResult } from "./compilerAdapter";

export function compileSccProgram(
  logger: Logger,
  opts: CompileSccProgramOptions,
  deps: CompileDeps = {},
): {
  outputFile: string;
  relFile: string;
  runtimeRelFile?: string;
  tempDir: string;
} {
  const assembleFile = deps.assembleFile ?? assemble;
  const linkFiles = deps.linkFiles ?? link;
  const compilerAdapter = deps.compilerAdapter ?? new ExternalSccCompilerAdapter({
    dcppPath: opts.dcppPath,
    sccz80Path: opts.sccz80Path,
    toolMode: opts.toolMode,
    assembleFile,
  });
  const comMode = !!opts.com || /\.com$/i.test(opts.outputFile);
  const tempDir = opts.tempDir
    ? path.resolve(opts.tempDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-cc-"));
  fs.mkdirSync(tempDir, { recursive: true });

  let runtimeRelFile: string | undefined;
  try {
    const compiled = compileSccSourceToRel(logger, {
      inputFile: opts.inputFile,
      includeDirs: opts.includeDirs,
      cppArgs: opts.cppArgs,
      sccArgs: opts.sccArgs,
      tempDir,
      verbose: opts.verbose,
      sym: opts.sym,
      smap: opts.smap,
    }, compilerAdapter);

    const linkInputs: string[] = [];
    if (opts.runtime) {
      runtimeRelFile = buildBundledRuntime(logger, tempDir, opts.runtime, opts.verbose, assembleFile);
      linkInputs.push(runtimeRelFile);
    }
    linkInputs.push(compiled.relFile, ...(opts.libraries ?? []).map((entry) => path.resolve(entry)));

    linkFiles(linkInputs, path.resolve(opts.outputFile), {
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
      outputFile: path.resolve(opts.outputFile),
      relFile: compiled.relFile,
      runtimeRelFile,
      tempDir,
    };
  } catch (error) {
    if (!opts.keepTemps && !opts.tempDir) {
      safeRmDir(tempDir);
    }
    throw error;
  }
}

function buildBundledRuntime(
  logger: Logger,
  tempDir: string,
  runtimeName: SccRuntimeName,
  verbose: boolean | undefined,
  assembleFile: AssembleFile,
): string {
  const runtimeSourcePath = path.join(tempDir, `${runtimeName}.scc.asm`);
  const runtimeAsmPath = path.join(tempDir, `${runtimeName}.asm`);
  const runtimeRelPath = path.join(tempDir, `${runtimeName}.rel`);

  fs.writeFileSync(runtimeSourcePath, getBundledSccRuntime(runtimeName), "utf8");
  fs.writeFileSync(
    runtimeAsmPath,
    translateSccAsm(fs.readFileSync(runtimeSourcePath, "utf8"), { moduleName: runtimeName }),
    "utf8",
  );

  const runtimeCtx = assembleFile(logger, runtimeAsmPath, runtimeRelPath, {
    relVersion: 2,
    verbose,
  });
  if (runtimeCtx.errors.length > 0) {
    throw new Error(`Assembly failed for bundled runtime ${runtimeName}: ${runtimeCtx.errors.map((e) => e.message).join("; ")}`);
  }

  return runtimeRelPath;
}
