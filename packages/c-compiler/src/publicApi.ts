import fs from "node:fs";
import path from "node:path";
import type { Logger } from "@mz80/core";
import type { CompileSccSourceResult } from "./scc/compilerAdapter";
import { TsSccCompilerAdapter } from "./scc/tsCompilerAdapter";

/** Stable file-oriented entrypoint for the bundled TypeScript C subset compiler. */
export type CompileCFileOptions = {
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

/** Stable source-oriented entrypoint; the source is staged under `tempDir`. */
export type CompileCSourceOptions = Omit<CompileCFileOptions, "inputFile"> & {
  source: string;
  fileName?: string;
};

export function compileCFile(logger: Logger, options: CompileCFileOptions): CompileSccSourceResult {
  return new TsSccCompilerAdapter().compileToRel(logger, options);
}

export function compileCSource(logger: Logger, options: CompileCSourceOptions): CompileSccSourceResult {
  const inputFile = path.resolve(options.tempDir, options.fileName ?? "source.c");
  fs.mkdirSync(path.dirname(inputFile), { recursive: true });
  fs.writeFileSync(inputFile, options.source, "utf8");
  return compileCFile(logger, { ...options, inputFile });
}
