import { AsmContext } from "../context";
import { OperandInfo } from "../operand/classifyOperand";
import { NodeInstr } from "../parser";

export interface InstrDef {
  match: (ctx: AsmContext, args: OperandInfo[]) => boolean;
  encode: (ctx: AsmContext, args: OperandInfo[], node: NodeInstr) => void;
}