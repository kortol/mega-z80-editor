"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const context_1 = require("../../context");
const encoder_1 = require("../../encoder");
const emit_1 = require("../../codegen/emit");
function makeCtx() {
    const ctx = (0, context_1.createContext)({ moduleName: "TEST" });
    (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    return ctx;
}
function makeNode(op, args, pos = { line: 1, file: "test.asm", phase: "analyze" }) {
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
    ];
    for (const [op, args] of unsupported) {
        test(`${op} throws unsupported`, () => {
            const ctx = makeCtx();
            expect(() => (0, encoder_1.encodeInstr)(ctx, makeNode(op, [...args]))).toThrow(/Unsupported extended instruction/);
        });
    }
});
