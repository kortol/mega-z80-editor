import { AsmContext } from "../context";
import { NodeInstr } from "../parser";

export interface InstrDef {
  match: (ctx: AsmContext, args: string[]) => boolean;
  encode: (ctx: AsmContext, args: string[], node: NodeInstr) => void;
}