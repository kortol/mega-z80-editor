import { AsmContext } from "./context";
import { NodeInstr } from "./node";
export declare function estimateInstrSize(ctx: AsmContext, node: NodeInstr): number;
export declare function encodeInstr(ctx: AsmContext, node: NodeInstr): void;
export declare function getZ80OpcodeTable(): Map<string, any>;
