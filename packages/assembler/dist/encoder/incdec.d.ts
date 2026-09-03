import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { InstrDef } from "./types";
export declare const incInstr: InstrDef[];
export declare const decInstr: InstrDef[];
export declare function encodeINC(ctx: AsmContext, node: NodeInstr): void;
export declare function encodeDEC(ctx: AsmContext, node: NodeInstr): void;
