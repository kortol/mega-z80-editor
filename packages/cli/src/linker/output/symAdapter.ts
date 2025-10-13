import { BaseTextAdapter } from "./common/baseTextAdapter";
import { LinkResult } from "../core/types";

export class SymAdapter extends BaseTextAdapter {
  readonly ext = ".sym";
  readonly tag = "[SYM]";

  constructor(private result: LinkResult) {
    super();
  }

  generateText(): string {
    const lines: string[] = ["SYMBOL TABLE", "------------"];
    const entries = [...this.result.symbols.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [name, sym] of entries) {
      const addr =
        sym.addr !== undefined
          ? `${sym.addr.toString(16).toUpperCase().padStart(4, "0")}H`
          : "----H";
      lines.push(
        `${name.padEnd(8)} ${addr}${sym.addr === undefined ? "   (UNDEF)" : ""}`
      );
    }

    return lines.join("\n");
  }
}
