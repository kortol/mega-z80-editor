import path from "node:path";
import { Logger } from "../logger";
import { compileSccProgram } from "../scc/compileProgram";
import { SccRuntimeName } from "../scc/runtime";

export type Mz80CcCliOptions = {
  runtime?: SccRuntimeName;
  library?: string[];
  include?: string[];
  cppArg?: string[];
  sccArg?: string[];
  dcpp?: string;
  sccz80?: string;
  tempDir?: string;
  keepTemps?: boolean;
  verbose?: boolean;
  wsl?: boolean;
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

export function compileSccProgramFromCli(
  logger: Logger,
  inputFile: string,
  outputFile: string,
  opts: Mz80CcCliOptions,
): void {
  const resolvedOutput = path.resolve(outputFile);
  const defaultCom = /\.com$/i.test(resolvedOutput);
  compileSccProgram(logger, {
    inputFile: path.resolve(inputFile),
    outputFile: resolvedOutput,
    includeDirs: opts.include ?? [],
    cppArgs: opts.cppArg ?? [],
    sccArgs: opts.sccArg ?? [],
    dcppPath: opts.dcpp,
    sccz80Path: opts.sccz80,
    tempDir: opts.tempDir ? path.resolve(opts.tempDir) : undefined,
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
  });
}
