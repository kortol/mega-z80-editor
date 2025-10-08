// import { AsmContext } from "../context";
// import { OperandInfo } from "../operand/classifyOperand";
// import { NodeInstr } from "../parser";
// import { evalExpr } from "../expr/eval";
// import { AssemblerErrorCode } from "../errors";
// import { tokenize } from "../tokenizer";
// import { parseExpr } from "../expr/parserExpr";
// import { makeEvalCtx } from "../expr/eval";
// import { InstrDef } from "./types";
// import { OperandKind } from "../operand/operandKind";

// export const jrInstr: InstrDef[] = [
//   {
//     match: (ctx, args) =>
//       args.length === 1 &&
//       (args[0].kind === OperandKind.IMM || args[0].kind === OperandKind.EXPR),
//     encode: encodeJR,
//   },
//   {
//     match: (ctx, args) =>
//       args.length === 2 &&
//       args[0].kind === OperandKind.FLAG &&
//       (args[1].kind === OperandKind.IMM || args[1].kind === OperandKind.EXPR),
//     encode: encodeJR,
//   },
// ];

// export const djnzInstr: InstrDef[] = [
//   {
//     match: (ctx, args) =>
//       args.length === 1 &&
//       (args[0].kind === OperandKind.IMM || args[0].kind === OperandKind.EXPR),
//     encode: encodeDJNZ,
//   },
// ];

// /**
//  * JR命令 (条件付き/無条件)
//  * - JR e        → 0x18 + disp
//  * - JR NZ,e     → 0x20 + disp
//  * - JR Z,e      → 0x28 + disp
//  * - JR NC,e     → 0x30 + disp
//  * - JR C,e      → 0x38 + disp
//  */
// export function encodeJR(ctx: AsmContext, args: OperandInfo[], node: NodeInstr) {
//   if (!args || args.length < 1) {
//     ctx.errors.push({
//       code: AssemblerErrorCode.MissingOperand,
//       message: "JR requires one operand",
//       line: node.line,
//     });
//     return;
//   }

//   const condMap: Record<string, number> = {
//     NZ: 0x20,
//     Z: 0x28,
//     NC: 0x30,
//     C: 0x38,
//   };

//   let opcode = 0x18; // default: JR e
//   let targetExpr;

//   if (args.length === 2) {
//     const cond = args[0].raw.toUpperCase();
//     if (condMap[cond] === undefined) {
//       ctx.errors.push({
//         code: AssemblerErrorCode.InvalidOperand,
//         message: `Invalid JR condition: ${cond}`,
//         line: node.line,
//       });
//       return;
//     }
//     opcode = condMap[cond];
//     targetExpr = args[1].raw;
//   } else {
//     targetExpr = args[0].raw;
//   }

//   const eCtx = makeEvalCtx(ctx);
//   const token = tokenize(targetExpr).filter(t => t.kind !== "eol");
//   const e = parseExpr(token);
//   const target = evalExpr(e, eCtx);
//   if (target.kind === 'Const') {
//     if (isNaN(target.value)) {
//       ctx.errors.push({
//         code: AssemblerErrorCode.ExprNaN,
//         message: `JR target could not be evaluated: ${targetExpr}`,
//         line: node.line,
//       });
//       return;
//     }

//     const rel = target.value - (ctx.loc + 2);
//     if (rel < -128 || rel > 127) {
//       ctx.errors.push({
//         code: AssemblerErrorCode.OutOfRangeRel,
//         message: `JR target out of range (${rel})`,
//         line: node.line,
//       });
//       return;
//     }

//     const disp = rel & 0xff;
//     const bytes = [opcode, disp];
//     ctx.texts.push({ addr: ctx.loc, data: bytes });
//     ctx.loc += bytes.length;
//   }
// }

// /**
//  * DJNZ命令 (Z80専用)
//  * - DJNZ e → 0x10 + disp
//  */
// export function encodeDJNZ(ctx: AsmContext, args: OperandInfo[], node: NodeInstr) {
//   if (!args || args.length !== 1) {
//     ctx.errors.push({
//       code: AssemblerErrorCode.MissingOperand,
//       message: "DJNZ requires one operand",
//       line: node.line,
//     });
//     return;
//   }

//   const eCtx = makeEvalCtx(ctx);
//   const token = tokenize(args[0].raw).filter(t => t.kind !== "eol");
//   const e = parseExpr(token);
//   const target = evalExpr(e, eCtx);
//   if (target.kind === 'Const') {

//     if (isNaN(target.value)) {
//       ctx.errors.push({
//         code: AssemblerErrorCode.ExprNaN,
//         message: `DJNZ target could not be evaluated: ${args[0].raw}`,
//         line: node.line,
//       });
//       return;
//     }

//     const rel = target.value - (ctx.loc + 2);
//     if (rel < -128 || rel > 127) {
//       ctx.errors.push({
//         code: AssemblerErrorCode.OutOfRangeRel,
//         message: `DJNZ target out of range (${rel})`,
//         line: node.line,
//       });
//       return;
//     }

//     const disp = rel & 0xff;
//     const bytes = [0x10, disp]; // opcode 0x10 = DJNZ
//     ctx.texts.push({ addr: ctx.loc, data: bytes });
//     ctx.loc += bytes.length;
//   }
// }
