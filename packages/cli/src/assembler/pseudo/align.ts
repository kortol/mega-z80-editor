import { AsmContext } from "../context";

export function handleALIGN(ctx: AsmContext, align: number) {
  const sec = ctx.sections.get(ctx.currentSection)!;
  const mask = align - 1;
  if (align <= 0 || (align & mask) !== 0)
    throw new Error(`ALIGN must be power of two`);

  // Keep section-level alignment requirement for linker placement.
  sec.align = Math.max(sec.align ?? 1, align);

  if (sec.lc & mask) {
    const newLc = (sec.lc + mask) & ~mask;
    if (ctx.phase === "emit") {
      const padding = newLc - sec.lc;
      sec.bytes.push(...new Array(padding).fill(0));
      sec.size += padding;
    }
    sec.lc = newLc;
  }
  ctx.loc = sec.lc;
}
