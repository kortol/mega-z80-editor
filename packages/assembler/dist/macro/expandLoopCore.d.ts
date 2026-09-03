import { AsmContext } from "../context";
import type { Node, NodeLoopBase } from "../node";
import { LoopFrame } from "../context";
/**
 * expandLoopCore()
 * すべてのループ系マクロ(REPT/WHILE/IRP/IRPC)を統一的に展開する。
 */
export declare function expandLoopCore(node: NodeLoopBase, ctx: AsmContext): Node[];
/**
 * \# / \##n / \##MAX / locals をトークン上で置換
 */
export declare function substituteLoopTokens(tokens: any[], ctx: AsmContext, frame: LoopFrame): void;
