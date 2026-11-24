import path from "node:path";
import fs from "node:fs";
import { Logger } from "@mz80/core";
import { compileSccProgram, RuntimeSelection } from "@mz80/c-compiler";
import { ExternalSccCompilerAdapter, TsSccCompilerAdapter } from "@mz80/c-compiler";
import type { LinkMemoryLayout } from "@mz80/core";
import type { RuntimeStartupOptions } from "@mz80/c-compiler";

export type Mz80CcCompilerKind = "sccz80" | "ts";

export type Mz80CcCliOptions = {
  targetConfig?: string;
  memory?: LinkMemoryLayout;
  startup?: RuntimeStartupOptions | false;
  compiler?: Mz80CcCompilerKind;
  tsAbi?: "internal" | "static-frame";
  runtime?: RuntimeSelection;
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
  const targetConfig=opts.targetConfig?JSON.parse(fs.readFileSync(path.resolve(opts.targetConfig),"utf8")):{};
  if(!targetConfig||typeof targetConfig!=="object"||Array.isArray(targetConfig)||Object.keys(targetConfig).some(key=>!["memory","startup"].includes(key)))throw new Error("target config must contain only memory and startup");
  const memory=opts.memory??targetConfig.memory;
  const defaultCom = /\.com$/i.test(resolvedOutput);
  if (opts.tsAbi && opts.compiler !== "ts") throw new Error("tsAbi requires compiler: ts");
  if (typeof opts.runtime === "object" && opts.runtime.features?.length && opts.compiler !== "ts") throw new Error("Numeric runtime features require compiler: ts");
  if (opts.tsAbi && !["internal", "static-frame"].includes(opts.tsAbi)) throw new Error("Unknown TS ABI");
  const compilerAdapter = opts.compiler === "ts"
    ? new TsSccCompilerAdapter({ abi: opts.tsAbi === "static-frame" ? "ts-static-frame" : "ts-internal" })
    : new ExternalSccCompilerAdapter({
      dcppPath: opts.dcpp,
      sccz80Path: opts.sccz80,
      toolMode: opts.wsl ? "wsl" : "host",
    });
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
    memory,
    startup: opts.startup??targetConfig.startup,
    libraries: opts.library ?? [],
    com: opts.com ?? defaultCom,
    orgText: opts.orgText ?? (defaultCom&&!memory ? "100H" : undefined),
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
