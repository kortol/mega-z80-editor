import { AsmContext, createContext, SourcePos } from "../../context";
import { NodeInstr } from "../../node";
import { encodeInstr } from "../../encoder";
import { initCodegen } from "../../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  return ctx;
}

function makeNode(op: string, args: string[], pos: SourcePos = { line: 1, file: "test.asm", phase: "analyze" }): NodeInstr {
  return { kind: "instr", op, args, pos };
}

describe("Extended ISA (R800/Z280) - encode errors", () => {
  const unsupported = [
    ["MULUB", ["A", "B"]],
    ["MULUW", ["HL", "BC"]],
    ["SLP", []],
    ["MLT", ["BC"]],
    ["IN0", ["A", "(0)"]],
    ["OUT0", ["(0)", "A"]],
    ["INO", ["A", "(0)"]],
    ["OUTO", ["(0)", "A"]],
    ["OTIM", ["(HL)"]],
    ["OTIMR", ["(HL)"]],
    ["OTDM", ["(HL)"]],
    ["OTDMR", ["(HL)"]],
    ["TSTIO", ["0"]],
    ["TST", ["A"]],
    ["MULT", ["HL", "BC"]],
    ["MULTU", ["HL", "DE"]],
    ["MULTW", ["HL", "SP"]],
    ["DIV", ["HL", "BC"]],
    ["DIVU", ["HL", "BC"]],
    ["JAF", ["LABEL"]],
    ["JAR", ["LABEL"]],
    ["LDUP", ["HL", "(1234H)"]],
    ["LOUD", ["HL", "(1234H)"]],
  ] as const;

  for (const [op, args] of unsupported) {
    test(`${op} throws unsupported`, () => {
      const ctx = makeCtx();
      expect(() => encodeInstr(ctx, makeNode(op, [...args]))).toThrow(
        /Unsupported extended instruction/
      );
    });
  }
});
