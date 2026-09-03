import { AsmContext } from "../context";
import { NodePseudo } from "../node";
export declare function isConditionalOp(op: string): boolean;
export declare function isConditionActive(ctx: AsmContext): boolean;
export declare function handleConditional(ctx: AsmContext, node: NodePseudo): void;
