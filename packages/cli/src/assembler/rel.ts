import { AsmContext } from "./context";

export function emitRel(ctx: AsmContext): string {
  const lines: string[] = [];

  // H record
  lines.push(`H ${ctx.moduleName}`);

  // T records
  for (const t of ctx.texts) {
    const bytes = t.data.map(b => b.toString(16).padStart(2, "0").toUpperCase());
    lines.push(`T ${t.addr.toString(16).padStart(4, "0").toUpperCase()} ${bytes.join(" ")}`);
  }

  // S records
  for (const [sym, addr] of ctx.symbols.entries()) {
    lines.push(`S ${sym} ${addr.toString(16).padStart(4, "0").toUpperCase()}`);
  }

  // R records
  for (const r of ctx.unresolved) {
    lines.push(`R ${r.addr.toString(16).padStart(4, "0").toUpperCase()} ${r.symbol}`);
  }

  // E record
  if ((ctx as any).entry !== undefined) {
    const entry = (ctx as any).entry as number;
    lines.push(`E ${entry.toString(16).padStart(4, "0").toUpperCase()}`);
  }

  return lines.join("\n");
}
