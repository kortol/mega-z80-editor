import { BaseTextAdapter } from "./common/baseTextAdapter";
import { LinkResult } from "../core/types";
import path from "path";

type FullpathMode = "off" | "rel" | "on";

/**
 * sjasm labelslist互換に寄せた MAP ファイルを出力するアダプタ
 */
export class MapAdapter extends BaseTextAdapter {
  readonly ext = ".map";
  readonly tag = "[MAP]";

  constructor(
    private result: LinkResult,
    private options: { fullpath?: FullpathMode; cwd?: string } = {}
  ) {
    super();
  }

  private formatSymbolLine(
    name: string,
    value: number,
    kind: "addr" | "const" = "addr",
    scope: "public" | "local" = "public",
    defFlag = "",
    moduleName = "",
    section = "",
    definedAt = ""
  ): string {
    const hex = `$${value.toString(16).toUpperCase().padStart(4, "0")}`;
    return `${name.padEnd(31)} = ${hex} ; ${kind}, ${scope}, ${defFlag}, ${moduleName}, ${section}, ${definedAt}`;
  }

  private buildAutoSymbols(): Array<{ name: string; value: number }> {
    if (this.result.segments.length === 0) return [];
    const out: Array<{ name: string; value: number }> = [];
    const min = Math.min(...this.result.segments.map((s) => s.range.min));
    const max = Math.max(...this.result.segments.map((s) => s.range.max));
    const tail = max + 1;

    out.push({ name: "__head", value: min });
    out.push({ name: "__size", value: tail - min });
    out.push({ name: "__tail", value: tail });

    for (const seg of this.result.segments) {
      const kind = seg.kind.toUpperCase();
      const h = `__${kind}_head`;
      const s = `__${kind}_size`;
      const t = `__${kind}_tail`;
      out.push({ name: h, value: seg.range.min });
      out.push({ name: s, value: seg.range.max - seg.range.min + 1 });
      out.push({ name: t, value: seg.range.max + 1 });
    }
    return out;
  }

  generateText(): string {
    const lines: string[] = [];

    const entries = [...this.result.symbols.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [name, sym] of entries) {
      lines.push(
        this.formatSymbolLine(
          name,
          sym.addr,
          "addr",
          "public",
          "",
          sym.module ?? "",
          sym.section ?? "",
          this.shortenDefinedAt(sym.definedAt)
        )
      );
    }

    for (const auto of this.buildAutoSymbols()) {
      lines.push(this.formatSymbolLine(auto.name, auto.value, "const", "public", "def", "__linker__", "", "generated"));
    }

    if (this.result.entry !== undefined) {
      lines.push(this.formatSymbolLine("__ENTRY", this.result.entry, "const", "public", "def", "__linker__", "", "generated"));
    }

    return lines.join("\n");
  }

  private shortenDefinedAt(definedAt?: string): string {
    if (!definedAt) return "";
    const m = definedAt.match(/^(.*):(\d+)$/);
    const rawFile = m ? m[1] : definedAt;
    const line = m ? m[2] : undefined;
    const file = rawFile.replace(/\\\\/g, "\\");
    const mode = this.options.fullpath ?? "off";

    if (mode === "off") {
      const base = path.basename(file);
      return line ? `${base}:${line}` : base;
    }
    if (mode === "on") {
      const abs = path.isAbsolute(file) ? file : path.resolve(this.getBaseDir(), file);
      const normalized = abs.replace(/\\/g, "/");
      return line ? `${normalized}:${line}` : normalized;
    }

    const baseDir = this.getBaseDir();
    const abs = path.isAbsolute(file) ? file : path.resolve(baseDir, file);
    const rel = path.relative(baseDir, abs);
    if (path.isAbsolute(rel)) {
      const normalizedAbs = abs.replace(/\\/g, "/");
      return line ? `${normalizedAbs}:${line}` : normalizedAbs;
    }
    const normalized = rel.replace(/\\/g, "/");
    return line ? `${normalized}:${line}` : normalized;
  }

  private getBaseDir(): string {
    return path.resolve(this.options.cwd ?? process.cwd());
  }
}
