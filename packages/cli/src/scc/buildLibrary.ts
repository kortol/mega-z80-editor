import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createArchive } from "../linker/archive";
import { Logger } from "../logger";
import {
  safeRmDir,
} from "./externalToolchain";
import {
  CompilerAdapter,
  ExternalSccCompilerAdapter,
  ExternalSccCompilerAdapterOptions,
} from "./compilerAdapter";
type ArchiveFiles = typeof createArchive;

export type BuildSccLibraryOptions = {
  outputFile: string;
  inputFiles: string[];
  includeDirs?: string[];
  cppArgs?: string[];
  sccArgs?: string[];
  dcppPath?: string;
  sccz80Path?: string;
  tempDir?: string;
  keepTemps?: boolean;
  verbose?: boolean;
  toolMode?: ExternalSccCompilerAdapterOptions["toolMode"];
};

type BuildDeps = {
  compilerAdapter?: CompilerAdapter;
  archiveFiles?: ArchiveFiles;
};

export function buildSccLibrary(
  logger: Logger,
  opts: BuildSccLibraryOptions,
  deps: BuildDeps = {},
): { archivePath: string; relFiles: string[]; tempDir: string } {
  const archiveFiles = deps.archiveFiles ?? createArchive;
  const compilerAdapter = deps.compilerAdapter ?? new ExternalSccCompilerAdapter({
    dcppPath: opts.dcppPath,
    sccz80Path: opts.sccz80Path,
    toolMode: opts.toolMode,
  });
  const tempDir = opts.tempDir
    ? path.resolve(opts.tempDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-lib-"));

  fs.mkdirSync(tempDir, { recursive: true });

  const relFiles: string[] = [];
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

    const archivePath = path.resolve(opts.outputFile);
    archiveFiles(relFiles, archivePath);
    logger.info(`Built SCC library: ${archivePath}`);
    return { archivePath, relFiles, tempDir };
  } catch (error) {
    if (!opts.keepTemps && !opts.tempDir) {
      safeRmDir(tempDir);
    }
    throw error;
  }
}
