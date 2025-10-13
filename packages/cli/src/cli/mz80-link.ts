import { parseRelFile } from "../linker/core/parser";
import { linkModules } from "../linker/core/linker";
import { BinOutputAdapter } from "../linker/output/binAdapter";
import { MapAdapter } from "../linker/output/mapAdapter";
import { SymAdapter } from "../linker/output/symAdapter";
import { LogAdapter } from "../linker/output/logAdapter";

export function link(
  inputFiles: string[],
  outputFile: string,
  opts: {
    verbose?: boolean;
    map?: boolean;
    sym?: boolean;
    log?: boolean;
  }
) {
  const verbose = !!opts.verbose; 

  const mods = inputFiles.map((f) => {
    if (verbose) console.log(`[LOAD] ${f}`);
    return parseRelFile(f);
  });

  const result = linkModules(mods);
  if (verbose) {
    console.log(`[PASS1] Collected ${result.symbols.size} symbols`);
    console.log(`[PASS2] Linked ${result.segments.length} segment(s)`);
  }

  // .bin
  new BinOutputAdapter(result).write(outputFile, verbose);

  // .map
  if (opts.map) {
    new MapAdapter(result).write(
      outputFile.replace(/\.[^.]+$/, ".map"),
      verbose
    );
  }

  // .sym
  if (opts.sym) {
    new SymAdapter(result).write(
      outputFile.replace(/\.[^.]+$/, ".sym"),
      verbose
    );
  }

  // .log
  if (opts.log) {
    // 現状はconsole.warnから収集予定 → 将来 logBuffer に差し替え
    new LogAdapter(result, []).write(
      outputFile.replace(/\.[^.]+$/, ".log"),
      verbose
    );
  }

  if (verbose) {
    console.log(`✅ Linked ${inputFiles.length} modules -> ${outputFile}`);
  }  
}
