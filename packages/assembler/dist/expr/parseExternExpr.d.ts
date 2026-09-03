import { AsmContext } from "../context";
/**
 * 外部シンボル参照をパースし、Reloc可能かを返す。
 * extern名 + 定数 の形式を許可。
 */
export declare function parseExternExpr(ctx: AsmContext, expr: string): {
    symbol: string;
    addend: number;
} | null;
