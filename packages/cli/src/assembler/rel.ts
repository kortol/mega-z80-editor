import { AsmContext } from "./context";
import { buildRelFile } from "./rel/builder";
import { TextRelAdapter } from "./rel/adapter";

export function emitRel(ctx: AsmContext): string {
  const file = buildRelFile(ctx);
  const adapter = new TextRelAdapter();
  return adapter.write(file) as string;
}
