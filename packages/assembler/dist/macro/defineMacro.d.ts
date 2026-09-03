import { AsmContext, SourcePos } from "../context";
import { Token } from "../tokenizer";
import type { MacroParam } from "../node";
export declare function defineMacro(name: string, params: MacroParam[], bodyTokens: Token[], ctx: AsmContext, defPos: SourcePos, isLocal?: boolean): void;
