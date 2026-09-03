import { AsmContext } from "./context";
import type { NodeMacroDef } from "./node";
export interface MacroScope {
    table: Map<string, NodeMacroDef>;
}
export declare function pushMacroScope(ctx: AsmContext): void;
export declare function popMacroScope(ctx: AsmContext): void;
export declare function defineLocalMacro(def: NodeMacroDef, ctx: AsmContext): void;
export declare function findMacro(name: string, ctx: AsmContext): NodeMacroDef | undefined;
export declare function getDefByName(ctx: AsmContext, name: string): NodeMacroDef | undefined;
export declare function expandMacros(ctx: AsmContext, depth?: number): void;
