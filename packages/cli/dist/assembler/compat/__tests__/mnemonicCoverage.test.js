"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function extractGrammarMnemonics(text) {
    const re = /"([A-Z0-9]{2,6})"i/g;
    const set = new Set();
    let m;
    while ((m = re.exec(text)))
        set.add(m[1]);
    const skip = new Set([
        // directives / meta
        "ORG",
        "DB",
        "DEFB",
        "DW",
        "DEFW",
        "DS",
        "DEFS",
        "EQU",
        "END",
        "IF",
        "ELSEIF",
        "ELSE",
        "ENDIF",
        "IFIDN",
        "EXTERN",
        "SECTION",
        "ALIGN",
        "INCLUDE",
        ".SYMLEN",
        ".WORD32",
        "DZ",
        // macro keywords
        "MACRO",
        "ENDM",
        "ENDR",
        "REPT",
        "REPEAT",
        "WHILE",
        "ENDW",
        "IRP",
        "IRPC",
        "LOCALMACRO",
        // other grammar tokens
        "FROM",
        // registers / conditions
        "A",
        "B",
        "C",
        "D",
        "E",
        "H",
        "L",
        "I",
        "R",
        "AF",
        "BC",
        "DE",
        "HL",
        "IX",
        "IY",
        "SP",
        "IXH",
        "IXL",
        "IYH",
        "IYL",
        "NZ",
        "NC",
        "PO",
        "PE",
        "Z",
        "P",
        "M",
    ]);
    for (const k of skip)
        set.delete(k);
    return Array.from(set).sort();
}
function extractEncoderMnemonics(encoderText, tableText) {
    const set = new Set();
    for (const match of encoderText.matchAll(/case \"([A-Z0-9]+)\"/g)) {
        set.add(match[1]);
    }
    for (const match of tableText.matchAll(/^\s*([A-Z]{2,6}):/gm)) {
        set.add(match[1]);
    }
    return Array.from(set).sort();
}
describe("Mnemonic coverage (grammar vs encoder)", () => {
    test("PEG grammar mnemonics are fully handled by encoder", () => {
        const grammarPath = path_1.default.resolve(__dirname, "../../grammar/z80_assembler.pegjs");
        const encoderPath = path_1.default.resolve(__dirname, "../../../assembler-old/encoder.ts");
        const instrTablePath = path_1.default.resolve(__dirname, "../../../assembler-old/encoder/instrTable.ts");
        const grammarText = fs_1.default.readFileSync(grammarPath, "utf8");
        const encoderText = fs_1.default.readFileSync(encoderPath, "utf8");
        const tableText = fs_1.default.readFileSync(instrTablePath, "utf8");
        const grammar = extractGrammarMnemonics(grammarText);
        const encoder = extractEncoderMnemonics(encoderText, tableText);
        const missing = grammar.filter(m => !encoder.includes(m));
        const extra = encoder.filter(m => !grammar.includes(m));
        if (missing.length || extra.length) {
            throw new Error([
                "Mnemonic coverage mismatch:",
                `Missing in encoder: ${missing.join(", ") || "(none)"}`,
                `Extra in encoder: ${extra.join(", ") || "(none)"}`,
            ].join("\n"));
        }
    });
});
