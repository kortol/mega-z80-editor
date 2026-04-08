import fs from "fs";
import path from "path";

function extractGrammarMnemonics(text: string): string[] {
  const re = /"([A-Z0-9]{2,6})"i/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) set.add(m[1]);
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
    "IFDIF",
    "IFDEF",
    "IFNDEF",
    "IFB",
    "IFNB",
    "EXTERN",
    "EXTERNAL",
    "EXT",
    "DEFL",
    "DEFM",
    "DC",
    "GLOBAL",
    "PUBLIC",
    "LOCAL",
    "SECTION",
    "ASEG",
    "CSEG",
    "DSEG",
    "COMMON",
    "LIST",
    "PAGE",
    "TITLE",
    "EXITM",
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
  for (const k of skip) set.delete(k);
  return Array.from(set).sort();
}

function extractEncoderMnemonics(encoderText: string, tableText: string): string[] {
  const set = new Set<string>();
  for (const match of encoderText.matchAll(/case \"([A-Z0-9]+)\"/g)) {
    set.add(match[1]);
  }
  for (const match of tableText.matchAll(/^\s*([A-Z0-9]{2,6}):/gm)) {
    set.add(match[1]);
  }
  return Array.from(set).sort();
}

describe("Mnemonic coverage (grammar vs encoder)", () => {
  test("PEG grammar mnemonics are fully handled by encoder", () => {
    const grammarPath = path.resolve(__dirname, "../../grammar/z80_assembler.pegjs");
    const encoderPath = path.resolve(__dirname, "../../../assembler/encoder.ts");
    const instrTablePath = path.resolve(__dirname, "../../../assembler/encoder/instrTable.ts");

    const grammarText = fs.readFileSync(grammarPath, "utf8");
    const encoderText = fs.readFileSync(encoderPath, "utf8");
    const tableText = fs.readFileSync(instrTablePath, "utf8");

    const grammar = extractGrammarMnemonics(grammarText);
    const encoder = extractEncoderMnemonics(encoderText, tableText);

    const missing = grammar.filter(m => !encoder.includes(m));
    const extra = encoder.filter(m => !grammar.includes(m));

    if (missing.length || extra.length) {
      throw new Error(
        [
          "Mnemonic coverage mismatch:",
          `Missing in encoder: ${missing.join(", ") || "(none)"}`,
          `Extra in encoder: ${extra.join(", ") || "(none)"}`,
        ].join("\n")
      );
    }
  });
});

