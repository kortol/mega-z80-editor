import { loadArchiveFile, parseRelFile } from "@mz80/core";

/** Reject an ordinary stack-ABI reference to a static-frame-only entry. */
export function validateTsAbiLinkInputs(files: string[]): void {
  const modules = files.flatMap((file) => /\.(lib|a|mza)$/i.test(file)
    ? loadArchiveFile(file).members.map((member) => member.module)
    : [parseRelFile(file)]);
  const definitions = new Set(modules.flatMap((mod) => mod.symbols.filter((s) => s.storage !== "EXT").map((s) => s.name.toUpperCase())));
  const prefix = "__TS_STATIC_FRAME_V1_";
  for (const mod of modules) {
    for (const symbol of [...mod.externs, ...mod.symbols.filter((s) => s.storage === "EXT").map((s) => s.name)]) {
      const name = symbol.toUpperCase();
      if (!definitions.has(name) && definitions.has(prefix + name)) {
        throw new Error(`TS ABI mismatch: '${symbol}' requires ts-internal, but its definition uses ts-static-frame v1`);
      }
    }
  }
}
