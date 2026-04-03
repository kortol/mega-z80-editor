# Z80 PEG Parser (PEG.js / peggy)

This folder contains a **working PEG grammar** for Z80 assembly and an adapter that
lets the CLI use the PEG parser.

## Scope

- Labels (`label:` and labeled statements)
- Instructions (`LD A, 0x10`, `ADD HL, BC`, ...)
- Directives: `ORG/DB/DW/DS/EQU/END`
- Extra directives: `DEFB/DEFW/DEFS`, `EXTERN`, `SECTION`, `INCLUDE`, `ALIGN`, `.SYMLEN`, `.WORD32`
- Macros: `MACRO ... ENDM`
- Loop macros: `REPT`, `IRP`, `IRPC`
- Expressions with `+ - * / %` and parentheses
- Registers and number literals (dec/hex/bin with `0x..` or `h`/`b` suffix)

## Generate parser

Requires peggy (formerly pegjs).

```bash
npm i -D peggy
npx peggy -o src/assembler/parser/gen/z80_assembler.js src/assembler/grammar/z80_assembler.pegjs
```

## CLI

```bash
# PEG parser (default)
mz80 as input.asm output.rel
```

## Use from Node

```js
import fs from "node:fs";
import parser from "./src/assembler/parser/gen/z80_assembler.js";

const src = fs.readFileSync("./examples/sample.asm", "utf8");
const ast = parser.parse(src);
console.dir(ast, { depth: null });
```

## Notes

- The grammar is **scannerless** (no external lexer). Whitespace and `;` comments are handled in the grammar.
- AST nodes are created **inside the grammar** using actions and carry `pos` (from `location()`).
- The CLI uses an adapter to map PEG AST into the legacy assembler pipeline.
- Extend `Mnemonic`, `Register`, and `DirectiveName` as needed.
