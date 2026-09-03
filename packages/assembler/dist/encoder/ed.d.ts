import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { InstrDef } from "./types";
export declare const edNoArgInstr: InstrDef[];
export declare const imInstr: InstrDef[];
export declare function encodeED(ctx: AsmContext, node: NodeInstr): void;
