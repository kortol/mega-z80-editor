import { AsmContext } from "../context";

export function handleSECTION(
  ctx: AsmContext,
  name: string,
  attrs?: { ALIGN?: number }
) {
  const upper = name.toUpperCase();
  const lower = "." + upper.toLowerCase(); // ← ".text" ".data" ".bss"

  let kind: "TEXT" | "DATA" | "BSS" | "CUSTOM" = [
    "TEXT",
    "DATA",
    "BSS",
  ].includes(upper)
    ? (upper as any)
    : "CUSTOM";

  // 既存セクション探索（.text/.data/.bssなど小文字化したキー）
  let sec = Array.from(ctx.sections.values()).find((s) => s.name === lower);

  if (!sec) {
    const id = ctx.sections.size;
    sec = {
      id,
      name: lower,
      kind,
      align: attrs?.ALIGN ?? 1,
      flags: 0,
      lc: 0,
      size: 0,
      bytes: [],
    };
    ctx.sections.set(id, sec);
  }
  ctx.currentSection = sec.id;
}
