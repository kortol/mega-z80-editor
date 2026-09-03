import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { InstrDef } from "./types";
export declare const exInstr: InstrDef[];
export declare function encodeEX(ctx: AsmContext, node: NodeInstr): void;
