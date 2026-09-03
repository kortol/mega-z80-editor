import fs from "node:fs";
import path from "node:path";

export const SCC_RUNTIME_NAMES = ["cpmcrt", "cpmlibc"] as const;

export type SccRuntimeName = (typeof SCC_RUNTIME_NAMES)[number];

function runtimeFilePath(name: SccRuntimeName): string {
  return path.join(__dirname, "runtime", `${name}.scc.asm`);
}

export function getBundledSccRuntime(name: SccRuntimeName): string {
  return fs.readFileSync(runtimeFilePath(name), "utf8");
}

export function writeBundledSccRuntime(name: SccRuntimeName, outputFile: string): void {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.copyFileSync(runtimeFilePath(name), outputFile);
}
