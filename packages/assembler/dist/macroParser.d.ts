import { AsmContext } from "./context";
import { Token } from "./tokenizer";
import type { Node } from "./node";
export type { Node, NodeInstr, PseudoArg, NodePseudo, NodeLabel, NodeMacroDef, NodeMacroInvoke, NodeEmpty, NodeLoopBase, MacroParam, } from "./node";
export declare function parseTokens(tokens: any[], ctx: AsmContext, opts?: any): Node[];
export declare function parse(ctx: AsmContext, tokens: Token[]): Node[];
export declare function isInstr(op: string): boolean;
