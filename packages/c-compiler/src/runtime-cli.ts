import { Logger } from "@mz80/core";
import { SccRuntimeName, writeBundledSccRuntime } from "./scc/runtime";

export function writeSccRuntimeFile(logger: Logger, runtimeName: SccRuntimeName, outputFile: string): void {
  writeBundledSccRuntime(runtimeName, outputFile);
  logger.info(`Wrote SCC runtime: ${runtimeName} -> ${outputFile}`);
}
