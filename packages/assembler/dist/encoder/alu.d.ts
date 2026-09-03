import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { InstrDef } from "./types";
export declare function makeALUDefs(op: string, opts?: {
    has16bit?: boolean;
    allowImplicitA?: boolean;
}): InstrDef[];
/**
 * ADD
 */
declare function encodeADD(ctx: AsmContext, node: NodeInstr): void;
/**
 * ADC
 */
declare function encodeADC(ctx: AsmContext, node: NodeInstr): void;
/**
 * SUB
 */
declare function encodeSUB(ctx: AsmContext, node: NodeInstr): void;
/**
 * SBC
 */
declare function encodeSBC(ctx: AsmContext, node: NodeInstr): void;
/**
 * AND
 */
declare function encodeAND(ctx: AsmContext, node: NodeInstr): void;
/**
 * OR
 */
declare function encodeOR(ctx: AsmContext, node: NodeInstr): void;
/**
 * XOR
 */
declare function encodeXOR(ctx: AsmContext, node: NodeInstr): void;
/**
 * CP
 */
declare function encodeCP(ctx: AsmContext, node: NodeInstr): void;
export { encodeADD, encodeADC, encodeSUB, encodeSBC, encodeAND, encodeOR, encodeXOR, encodeCP, };
