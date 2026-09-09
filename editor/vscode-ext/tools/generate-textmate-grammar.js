const fs = require("node:fs");
const path = require("node:path");

const EXT_ROOT = path.resolve(__dirname, "..");
// The runtime staging step copies this public assembler asset first.  Keeping
// grammar generation on the staged copy prevents the extension build from
// reaching into another package's source tree.
const MNEMONICS_JSON = path.join(
  EXT_ROOT,
  "server",
  "node_modules",
  "@mz80",
  "assembler",
  "dist",
  "grammar",
  "z80_mnemonics.json",
);
const OUT_FILE = path.join(EXT_ROOT, "syntaxes", "z80-asm.tmLanguage.json");

const EXTRA_DIRECTIVES = [
  "LOCALMACRO", "EXTERNAL", ".SYMLEN", ".WORD32", "INCPATH", "COMMON", "ELSEIF", "IFNDEF",
  "REPEAT", "ENDIF", "EXITM", "IFDEF", "IFDIF", "IFIDN", "TITLE", "WHILE", "ASEG", "CSEG",
  "DEFL", "DEFM", "DSEG", "ELSE", "ENDW", "IFNB", "IRPC", "LIST", "PAGE", "EXT", "IFB",
  "IRP", "DC", "DS", "DZ", "IF", "SET",
];

const EXTRA_INSTRUCTIONS = [
  "CPDR", "CPIR", "DIVU", "INDR", "INIR", "LDDR", "LDIR", "LDUP", "LOUD", "MULT", "MULTU",
  "MULTW", "MULUB", "MULUW", "OTDM", "OTDMR", "OTDR", "OTIM", "OTIMR", "OTIR", "OUT0",
  "OUTD", "OUTI", "OUTO", "RLD", "RRD", "SLL", "SLP", "TST", "TSTIO", "IN0", "INO",
  "JAF", "JAR", "LDD", "LDI", "MLT", "DIV",
];

const REGISTERS = ["A", "B", "C", "D", "E", "F", "H", "L", "AF", "BC", "DE", "HL", "IX", "IY", "SP", "PC", "I", "R", "IXH", "IXL", "IYH", "IYL"];
const CONDITIONS = ["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"];

function loadMnemonics() {
  const parsed = JSON.parse(fs.readFileSync(MNEMONICS_JSON, "utf8"));
  return {
    instructions: uniq([...(parsed.instructions || []), ...EXTRA_INSTRUCTIONS]).sort(sortLongestFirst),
    directives: uniq([...(parsed.directives || []), ...EXTRA_DIRECTIVES]).sort(sortLongestFirst),
  };
}

function uniq(items) {
  return [...new Set(items.map((x) => String(x).trim()).filter(Boolean))];
}

function sortLongestFirst(a, b) {
  return b.length - a.length || a.localeCompare(b);
}

function wordAlternation(items, { allowDot = false } = {}) {
  return items.map((item) => {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (allowDot && item.startsWith(".")) {
      return `(?<![A-Za-z0-9_])${escaped}\\b`;
    }
    return `\\b${escaped}\\b`;
  }).join("|");
}

function buildGrammar() {
  const { instructions, directives } = loadMnemonics();
  return {
    scopeName: "source.z80-asm",
    name: "Z80 Assembly",
    patterns: [
      { include: "#comment" },
      { include: "#strings" },
      { include: "#label" },
      { include: "#directive" },
      { include: "#instruction" },
      { include: "#register" },
      { include: "#condition" },
      { include: "#number" },
      { include: "#operator" },
    ],
    repository: {
      comment: {
        patterns: [
          { name: "comment.line.semicolon.z80-asm", match: ";.*$" }
        ]
      },
      strings: {
        patterns: [
          {
            name: "string.quoted.double.z80-asm",
            begin: "\"",
            end: "\"",
            patterns: [{ name: "constant.character.escape.z80-asm", match: "\\\\." }]
          },
          {
            name: "string.quoted.single.z80-asm",
            begin: "'",
            end: "'",
            patterns: [{ name: "constant.character.escape.z80-asm", match: "\\\\." }]
          }
        ]
      },
      label: {
        patterns: [
          { name: "entity.name.label.z80-asm", match: "(?i)^\\s*([.@]?[A-Z_@][A-Z0-9_@.]*)\\s*:" },
          { name: "entity.name.label.z80-asm", match: "(?i)^\\s*([.@]?[A-Z_@][A-Z0-9_@.]*)\\b(?=\\s+(?:EQU|DEFL|:=)\\b)" },
        ]
      },
      directive: {
        patterns: [
          {
            name: "keyword.control.directive.z80-asm",
            match: `(?i)(?:${wordAlternation(directives, { allowDot: true })})`
          }
        ]
      },
      instruction: {
        patterns: [
          {
            name: "keyword.control.instruction.z80-asm",
            match: `(?i)(?:${wordAlternation(instructions)})`
          }
        ]
      },
      register: {
        patterns: [
          {
            name: "variable.language.register.z80-asm",
            match: `(?i)\\b(?:${REGISTERS.join("|")})\\b`
          }
        ]
      },
      condition: {
        patterns: [
          {
            name: "constant.language.condition.z80-asm",
            match: `(?i)\\b(?:${CONDITIONS.join("|")})\\b`
          }
        ]
      },
      number: {
        patterns: [
          { name: "constant.numeric.hex.z80-asm", match: "(?i)\\b(?:0X[0-9A-F]+|[0-9][0-9A-F]*H)\\b" },
          { name: "constant.numeric.binary.z80-asm", match: "(?i)\\b(?:[01]+B|0B[01]+)\\b" },
          { name: "constant.numeric.octal.z80-asm", match: "(?i)\\b(?:[0-7]+O|[0-7]+Q)\\b" },
          { name: "constant.numeric.decimal.z80-asm", match: "\\b\\d+\\b" },
          { name: "constant.language.current-address.z80-asm", match: "\\$" },
        ]
      },
      operator: {
        patterns: [
          { name: "keyword.operator.expression.z80-asm", match: "<<|>>|:=|[+\\-*/%&|^~]" },
          { name: "punctuation.separator.arguments.z80-asm", match: "," },
          { name: "punctuation.section.parens.z80-asm", match: "[()\\[\\]]" },
        ]
      },
    }
  };
}

fs.writeFileSync(OUT_FILE, `${JSON.stringify(buildGrammar(), null, 2)}\n`);
console.log(`[generate-textmate-grammar] wrote ${OUT_FILE}`);
