import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { InstrDef } from "./types";
/**
 * 単発 Misc 命令
 */
export declare function encodeMisc(ctx: AsmContext, node: NodeInstr): void;
export declare const miscInstr: InstrDef[];
