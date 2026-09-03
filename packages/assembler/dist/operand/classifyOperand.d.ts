import { AsmContext } from '../context';
import { OperandKind } from './operandKind';
export interface OperandInfo {
    kind: OperandKind;
    raw: string;
    text?: string;
    disp?: number;
}
export declare function classifyOperand(ctx: AsmContext, s: string): OperandInfo;
