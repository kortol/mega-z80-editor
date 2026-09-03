import { RelModuleV2 } from "./types";
/**
 * `.rel v2` writer
 */
/**
 * RelV2 writer (multi-section aware)
 * -----------------------------------------------------
 * 出力フォーマット:
 *   MZ8R (magic)
 *   version 2
 *   $SECTION <id> <name> size=<size> align=<align>
 *   T <addr> <bytes...>  ; per section
 *   S <name> <addr>
 *   E <entry>
 */
export declare function writeRelV2(mod: RelModuleV2, outPath: string): void;
