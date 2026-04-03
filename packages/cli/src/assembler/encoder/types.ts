import { AsmContext } from "../context";
import { OperandInfo } from "../operand/classifyOperand";
import { NodeInstr } from "../node";

export interface InstrDef {
  /**
   * この命令定義にマッチするかどうか
   */
  match: (ctx: AsmContext, args: OperandInfo[]) => boolean;

  /**
   * 実際のバイト列を出力する
   */
  encode: (ctx: AsmContext, args: OperandInfo[], node: NodeInstr) => void;

  /**
   * 命令長を見積もる（Phase1専用）
   * 通常は固定長だが、アドレッシングモードにより可変長を返すことも可能。
   */
  estimate?: ((ctx: AsmContext, args: OperandInfo[], node: NodeInstr) => number) | number;
}
