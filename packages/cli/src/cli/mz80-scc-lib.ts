import path from "node:path";
import { Logger } from "../logger";
import { buildSccLibrary } from "../scc/buildLibrary";
import { resolveSccLibraryPreset, SccLibraryPresetName } from "../scc/libraryPresets";

export type SccLibCliOptions = {
  include?: string[];
  cppArg?: string[];
  sccArg?: string[];
  dcpp?: string;
  sccz80?: string;
  tempDir?: string;
  keepTemps?: boolean;
  verbose?: boolean;
  wsl?: boolean;
  preset?: SccLibraryPresetName;
};

export function buildSccLibraryArchive(
  logger: Logger,
  outputFile: string,
  inputFiles: string[],
  opts: SccLibCliOptions,
): void {
  const resolvedInputs = opts.preset
    ? [
      ...resolveSccLibraryPreset(opts.preset).map((file) => path.resolve(inputFiles[0], file)),
      ...inputFiles.slice(1).map((file) => path.resolve(file)),
    ]
    : inputFiles.map((file) => path.resolve(file));
  buildSccLibrary(logger, {
    outputFile: path.resolve(outputFile),
    inputFiles: resolvedInputs,
    includeDirs: opts.include ?? [],
    cppArgs: opts.cppArg ?? [],
    sccArgs: opts.sccArg ?? [],
    dcppPath: opts.dcpp,
    sccz80Path: opts.sccz80,
    tempDir: opts.tempDir ? path.resolve(opts.tempDir) : undefined,
    keepTemps: opts.keepTemps,
    verbose: opts.verbose,
    toolMode: opts.wsl ? "wsl" : "host",
  });
}
