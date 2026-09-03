import { AsmContext } from "./context";
import { buildRelFile } from "@mz80/core";
import { TextRelAdapter } from "@mz80/core";

export function emitRel(ctx: AsmContext): string {
  const file = buildRelFile(ctx);
  const adapter = new TextRelAdapter();
  return adapter.write(file) as string;
}
