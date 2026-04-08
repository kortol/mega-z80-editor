import { BaseTextAdapter } from "./common/baseTextAdapter";
import { LinkResult } from "../core/types";
import { writeOutputFile } from "./common/outputUtils";

export class BinOutputAdapter extends BaseTextAdapter {
  readonly ext = ".abs";
  readonly tag = "[BIN]";

  constructor(private result: LinkResult) {
    super();
  }

  private getPrimarySegment(): { range: { min: number; max: number }; data: Uint8Array } {
    if (this.result.segments.length === 0) throw new Error("No segments");
    const seg = this.result.segments[0];
    if (!seg.data) throw new Error("Segment has no data");
    return { range: seg.range, data: seg.data };
  }

  generateText(): string | Uint8Array {
    const seg = this.getPrimarySegment();
    return seg.data;
  }

  generateDumpText(): string {
    const seg = this.getPrimarySegment();

    // HEX表現を生成（16バイト単位）
    const lines: string[] = [];
    for (let i = 0; i < seg.data.length; i += 16) {
      const chunk = seg.data.slice(i, i + 16);
      const addr = (seg.range.min + i).toString(16).padStart(4, "0").toUpperCase();
      const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
      lines.push(`${addr}: ${hex}`);
    }
    return lines.join("\n");
  }

  write(targetFile: string, verbose = false): void {
    const bin = this.generateText();
    writeOutputFile(targetFile, bin, verbose, this.tag);

    // Keep a text dump next to .com outputs for debugging parity.
    if (/\.com$/i.test(targetFile)) {
      const dump = this.generateDumpText();
      writeOutputFile(`${targetFile}.dmp`, dump, verbose, "[DMP]");
    }
  }
}
