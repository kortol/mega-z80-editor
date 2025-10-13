import { AsmContext } from "../context";

export function handleALIGN(ctx: AsmContext, align: number) {
  const sec = ctx.sections.get(ctx.currentSection)!;
  const mask = align - 1;
  if (align <= 0 || (align & mask) !== 0) throw new Error(`ALIGN must be power of two`);
  if (sec.lc & mask) sec.lc = (sec.lc + mask) & ~mask;
}
