import { RelModuleV2 } from "./types";

export function adaptV2toV1(mod: RelModuleV2) {
  // TEXT+DATA のみ結合、それ以外は無視
  const textLike = mod.sections.filter(s => s.kind === "TEXT" || s.kind === "DATA");
  const bytes: number[] = [];

  let offsetMap: Record<number, number> = {};
  let cursor = 0;
  for (const s of textLike) {
    offsetMap[s.id] = cursor;
    if (s.data) {
      bytes.push(...s.data);
      cursor += s.data.length;
    }
  }

  const fixups = mod.fixups.map(f => ({
    loc: (offsetMap[f.sectionId] ?? 0) + f.offset,
    symIndex: f.symIndex,
    width: f.width,
    signed: f.signed,
    pcrel: f.pcrel,
    addend: f.addend,
  }));

  return {
    symbols: mod.symbols.map(s => ({
      name: s.name,
      value: s.value,
      storage: s.storage,
    })),
    data: Uint8Array.from(bytes),
    fixups,
  };
}
