import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { InstrDef } from "./types";
export declare const cbRotInstr: InstrDef[];
export declare const cbBitInstr: InstrDef[];
export declare function encodeCB(ctx: AsmContext, node: NodeInstr): void;
