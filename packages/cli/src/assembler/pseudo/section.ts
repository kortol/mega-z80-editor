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

  // --- 現在のセクションを退避し、LCを保存 ---
  if (ctx.sections.has(ctx.currentSection)) {
    const prev = ctx.sections.get(ctx.currentSection)!;
    prev.lc = ctx.loc; // 🔹 現在位置を前セクションに記録
    prev.size = Math.max(prev.size, prev.lc);
  }

  console.log(ctx.sections);

  // 既存セクション探索（.text/.data/.bssなど小文字化したキー）
  let sec = Array.from(ctx.sections.values()).find((s) => s.name === lower);

  // なければ作成
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
  // 🔹 loc をそのセクションの lc に復元
  ctx.loc = sec.lc;

  console.log(`Switched to section ${sec.name} (id=${sec.id}) at loc=${ctx.loc}`);
}
