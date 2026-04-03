"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const context_1 = require("../context");
const pseudo_1 = require("../pseudo");
const emit_1 = require("../codegen/emit");
function makeCtx() {
    const ctx = (0, context_1.createContext)({ moduleName: "TEST" });
    (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    return ctx;
}
function makeNode(op, args, pos = { line: 1, file: "test.asm", phase: "analyze" }) {
    return { kind: "pseudo", op, args: args.map(arg => ({ value: arg })), pos };
}
describe("pseudo - dispatcher", () => {
    test("unknown pseudo throws", () => {
        const ctx = makeCtx();
        expect(() => (0, pseudo_1.handlePseudo)(ctx, makeNode("FOOBAR", [])))
            .toThrow(/Unknown pseudo/);
    });
});
