// src/linker/output/logAdapter.ts
import { BaseTextAdapter } from "./common/baseTextAdapter";
import { LinkResult } from "../core/types";

export class LogAdapter extends BaseTextAdapter {
  readonly ext = ".log";
  readonly tag = "[LOG]";

  constructor(
    private result: LinkResult,
    private warnings: string[] = []
  ) {
    super();
  }

  public generateText(): string {
    const lines: string[] = ["LINK REPORT", "------------"];
    const segCount = this.result.segments.length;
    const symCount = this.result.symbols.size;
    const entry = this.result.entry !== undefined
      ? `${this.result.entry.toString(16).toUpperCase().padStart(4, "0")}H`
      : "(none)";

    lines.push(`Segments: ${segCount}`);
    lines.push(`Symbols: ${symCount}`);
    lines.push(`Entry: ${entry}`);

    if (this.warnings.length > 0) {
      lines.push("", "WARNINGS:");
      this.warnings.forEach((msg, i) =>
        lines.push(`  [W${(i + 1).toString().padStart(3, "0")}] ${msg}`)
      );
    } else {
      lines.push("", "No warnings.");
    }

    return lines.join("\n");
  }
}
