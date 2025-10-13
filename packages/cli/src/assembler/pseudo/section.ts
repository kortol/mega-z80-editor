import { AsmContext } from "../context";

export function handleSECTION(ctx: AsmContext, name: string, attrs?: {ALIGN?: number}) {
  const upper = name.toUpperCase();
  let kind: "TEXT"|"DATA"|"BSS"|"CUSTOM" =
    ["TEXT","DATA","BSS"].includes(upper) ? (upper as any) : "CUSTOM";
  let sec = Array.from(ctx.sections.values()).find(s => s.name === upper);

  if (!sec) {
    const id = ctx.sections.size;
    sec = {
      id, name: upper, kind, align: attrs?.ALIGN ?? 1,
      flags: 0, lc: 0, size: 0, bytes: []
    };
    ctx.sections.set(id, sec);
  }
  ctx.currentSection = sec.id;
}
