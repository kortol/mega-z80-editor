import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { InstrDef } from "./types";
export declare const inInstr: InstrDef[];
export declare const outInstr: InstrDef[];
export declare function encodeIO(ctx: AsmContext, node: NodeInstr): void;
