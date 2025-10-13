// src/cli/mz80-link.ts
import { parseRelFile } from "../linker/core/parser";
import { linkModules } from "../linker/core/linker";
import { BinOutputAdapter } from "../linker/output/binAdapter";
import * as fs from "fs";

export function link(inputFiles: string[], outputFile: string) {
  const mods = inputFiles.map(parseRelFile);
  const result = linkModules(mods);
  const verbose = true;

  const adapter = new BinOutputAdapter(result);
  adapter.write(outputFile, verbose);

  console.log(`Linked ${inputFiles.length} modules -> ${outputFile}`);
  for (const seg of result.segments) {
    console.log(
      `Segment bank=${seg.bank} kind=${seg.kind} ` +
      `range=${seg.range.min.toString(16)}h..${seg.range.max.toString(16)}h` +
      (seg.data ? ` size=${seg.range.max - seg.range.min + 1}` : " (bss)")
    );
  }
  if (result.entry !== undefined) {
    console.log(`Entry point: ${result.entry.toString(16)}h`);
  }
}

