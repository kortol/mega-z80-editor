import { BaseTextAdapter } from "./common/baseTextAdapter";
import { LinkResult } from "../core/types";
import { formatHumanSize } from "./common/outputUtils";

/**
 * M80スタイルのMAPファイルを出力するアダプタ
 */
export class MapAdapter extends BaseTextAdapter {
  ext = ".map";
  tag = "[MAP]";

  constructor(private result: LinkResult) {
    super();
  }

  generateText(): string {
    const lines: string[] = [];

    lines.push("LINK MAP OF OUTPUT");
    lines.push("---------------------------------");

    // --- シンボル一覧
    const entries = [...this.result.symbols.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [name, { bank, addr }] of entries) {
      const isUnresolved = addr === 0;
      const mark = isUnresolved ? "?" : "@";
      const addrStr = isUnresolved
        ? "----H"
        : addr.toString(16).toUpperCase().padStart(4, "0") + "H";
      lines.push(`${mark}${name.padEnd(8)} ${addrStr}   BANK${bank}`);
    }

    // --- セグメント情報
    lines.push("SEGMENTS:");
    for (const seg of this.result.segments) {
      const size = seg.range.max - seg.range.min + 1;
      const human = formatHumanSize(size);
      lines.push(
        `  [${seg.kind}] ${seg.range.min.toString(16).padStart(4, "0")}H..${seg.range.max
          .toString(16)
          .padStart(4, "0")}H size=${size.toString(16).toUpperCase().padStart(4, "0")}H (${human})`
      );
    }

    // --- エントリ
    if (this.result.entry !== undefined) {
      lines.push(`ENTRY: ${this.result.entry.toString(16).toUpperCase().padStart(4, "0")}H`);
    }

    return lines.join("\n");
  }
}
