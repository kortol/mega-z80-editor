# PEG Compatibility Cases (Legacy vs PEG)

This list defines the minimum set of source cases to compare between legacy and PEG.
The goal is output/diagnostic parity for assembler and linker inputs.

## Policy (Compatibility-First)
- PEG parser should accept a broad, assembler-family superset (R800/Z280含む想定)
- Invalid or unsupported combinations are rejected during **encoding** with clear errors
- New ISA extensions must be **explicitly added** to the PEG mnemonic list and encoder tables when decided

## Core Instructions/Operands
- Basic instruction parsing: `LD A,1`, `CALL START`
  - Source: `packages/cli/src/assembler-old/__tests__/parser.test.ts`
- Label + instruction on same line: `START: LD A,1`
  - Source: `packages/cli/src/assembler-old/__tests__/parser.test.ts`
- Conditional jumps and indirect forms (JP/JR/DJNZ)
  - Source: minimal fixtures to be added
- Edge Z80 opcode forms
  - `IM 0/1/2`, `EX AF,AF'`, `IN (C)`, `IN F,(C)`, `OUT (C),0`, `LD SP,IX/IY`
  - Source: `packages/cli/src/assembler/compat/fixtures.ts` (`z80_edge_io`)
  - `OUT (n),r` などは **パース可**、エンコードでエラー
- ALU indexed operands
  - `ADD/ADC/SUB/SBC/AND/OR/XOR/CP` with `(IX+d)` / `(IY+d)`
  - Source: `packages/cli/src/assembler/compat/fixtures.ts` (`z80_edge_alu_indexed`)

## Accepted-But-Encode-Error (Examples)
- `IN r,(n)` where r ≠ A
- `OUT (n),r` where r ≠ A
- `OUT (C),n` where n ≠ 0
- `JP r` / `CALL (HL)` / `JR (HL)` など不正な分岐形式
- `LD (mem),(mem)` / `LD IX/IY,IX/IY` など不正なLD形式
- `ADD HL,IX/IY` / `ADC HL,IX/IY` / `SBC HL,IX/IY` などZ80未定義形式

## Undocumented / Non-Standard (Supported)
- `SLL r` / `SLL (HL)` / `SLL (IX/IY+d)`
- `IN F,(C)` (same opcode as `IN (C)`)
- `OUT (C),0`

## CB/ED Encode-Errors (Examples)
- `BIT 8,r` / `RES 8,r` / `SET 8,r` (bit out of range)
- `RLC (BC)` など CBで不正な参照
- `IM 3` / `LD IY,I` など EDで未対応な形式

## Extended ISA (TBD)
- R800/Z280 specific mnemonics are **not enumerated yet**
- Additions require:
  - PEG mnemonic/operand rules update
  - Encoder implementation (or explicit encode-time error with rationale)
  - Compatibility fixture/test case

## R800 (Extension Summary)
- Adds `MULUB` and `MULUW` (R800-only multiply instructions) citeturn0search0turn0search4
- IX/IY high/low 8-bit registers (`IXH/IXL/IYH/IYL`) are **official** on R800 citeturn0search0turn0search4
- `SLL` behavior differs on R800 (treated as `SLA`) citeturn0search1turn0search5

## Z180 / HD64180 (Extension Summary)
- Adds `SLP` (sleep) instruction citeturn1search44
- Adds `MLT rr` (multiply register pairs) citeturn1search44
- Adds port and block I/O variants (`IN0/OUT0`, `OTIM/OTIMR/OTDM/OTDMR`) citeturn1search44
- Adds test instructions (`TST`, `TSTIO`) citeturn1search44

## Z280 (Extension Summary)
- Z280 instruction set is a **superset of Z80** (object-code compatible) citeturn2search32turn3view0
- Adds control-flow instructions `JAF` and `JAR` (aux register file tests) citeturn4view0turn4view1
- Adds user-space load/store forms `LDUP` and `LOUD` (privileged) citeturn4view2turn4view3
- Adds multiply/divide families (`MULT/MULTW/MULTU`, `DIV/DIVU`) citeturn4view4turn4view5

## Extended ISA Test Plan (Docs-Only)
- R800: add fixtures for `MULUB`, `MULUW`, IX/IY 8-bit regs, and `SLL` behavior note
- Z180/HD64180: add fixtures for `SLP`, `MLT`, `IN0/OUT0`, `OTIM/OTDM` families, `TST/TSTIO`
- Z280: add fixtures for `JAF/JAR`, `LDUP/LOUD`, and `MULT/DIV` families
 - Implemented: encode-error tests in `packages/cli/src/assembler-old/encoder/__tests__/extended_isa.test.ts`

## Directives
- ORG, DB, DW, DS, END
  - Source: `packages/cli/src/assembler-old/__tests__/parser.test.ts`
- DEFB/DEFW/DEFS (aliases)
  - Source: add minimal fixture
- EXTERN
  - Source: add minimal fixture (EXTERN symbol list)
- SECTION / ALIGN
  - Source: `packages/cli/src/assembler-old/__tests__/p2a_section_org.test.ts`
- INCLUDE
  - Source: `packages/cli/src/assembler-old/__tests__/parser.test.ts`
  - Multi-file: `packages/cli/src/assembler-old/__tests__/macro_local.test.ts` (assembleSourceMulti)
- .SYMLEN / .WORD32
  - Source: add minimal fixture

## Expressions
- Binary ops, precedence, current address `$`
  - Source: add minimal fixture

## Macros
- MACRO/ENDM basic parsing
  - Source: `packages/cli/src/assembler-old/__tests__/macro.parse.test.ts`
- Macro with args expansion
  - Source: `packages/cli/src/assembler-old/__tests__/macro.expand.test.ts`
- Macro args edge cases
  - Source: `packages/cli/src/assembler-old/__tests__/macro-args.stage2.test.ts`
- LOCALMACRO scoping/visibility
  - Source: `packages/cli/src/assembler-old/__tests__/macro_local.test.ts`

## Loop Macros
- REPT / nested REPT / IRP / IRPC
  - Source: `packages/cli/src/assembler-old/__tests__/macro_loop_source.test.ts`
- WHILE and loop counters (if required for PEG parity)
  - Source: `packages/cli/src/assembler-old/__tests__/macro_loop_source.test.ts`

## Macro / Pseudo Compatibility Report (sjasm / m80)
### Implemented (PEG/legacy parity)
- Macro definition styles:
  - `NAME MACRO ... ENDM`
  - `MACRO NAME ... ENDM` (PEG)
- Macro args:
  - `A,B` and `(A,B)` list forms
  - Positional `\1`, `\2`, ...
  - Token replacement inside expressions (e.g. `COUNT+1`)
- Macro scoping:
  - `LOCALMACRO` blocks with nested local scopes
  - `%%LABEL` local labels are uniquified per invocation
- Loop macros:
  - `REPT/REPEAT`, `IRP`, `IRPC`, `WHILE/ENDW`, `ENDM/ENDR` terminators
  - `\#`, `\##n`, `\##MAX` loop counters
  - `@#` (sjasm-style) mapped to `COUNTER`
- Conditional pseudo:
  - `IF/ELSEIF/ELSE/ENDIF`, `IFIDN`
- Pseudo directives implemented:
  - `ORG`, `END`, `EQU`, `SET`
  - `DB/DEFB`, `DW/DEFW`, `DS/DEFS`, `DZ`
  - `EXTERN` (accepts `FROM` but ignored)
  - `SECTION` (supports `ALIGN=`), `INCLUDE`, `ALIGN`, `.SYMLEN`, `.WORD32`

### Missing vs sjasm/m80 (known gaps)
- Conditional directives not implemented:
  - `IFDEF/IFNDEF`, `IFIDNI`, `IFDIF/IFDIFI`, `IFB/IFNB`
- Pseudo directives not implemented:
  - `PUBLIC/LOCAL/GLOBAL/SEGMENT` are parsed but will error in pseudo handler
  - No `INCBIN/INCLUDEBIN`, `TITLE`, `PAGE`, `LIST/NOLIST`, etc.
- Macro args limitations:
  - No quoting/escaping to keep commas inside a single arg
  - No default args / varargs / named args

### Notes
- Default is `strictMacro=false` (m80-like: macro overrides instruction name).
- `strictMacro=true` rejects macro definitions that shadow Z80 mnemonics.

### CLI Gaps (sjasm/m80 Compatibility)
- Parser choice is not CLI-visible:
  - PEG parser is always used by `mz80 as`
- Options missing for compatibility tuning:
  - No CLI flag to force `strictMacro` (sjasm-like: do not allow macro override)
  - No CLI flag for case sensitivity
- Output format is mz80-specific:
  - `.rel` v1/v2 are mz80 formats (not sjasm/m80 object outputs)
  - `--rel-version` only affects mz80 output, not compatibility

### CLI Option Comparison (sjasmplus / M80 / mz80)
| Capability | sjasmplus CLI | M80 CLI | mz80 CLI |
| --- | --- | --- | --- |
| Command syntax | `sjasmplus [options] sourcefile(s)` citeturn6view1 | `M80 objfile,prnfile=srcfile/s1.../sn` (comma/equals, slash switches) citeturn13view3 | `mz80 as <input> <output>` |
| CPU/ISA selection | `--zxnext`, `--i8080`, `--lr35902` citeturn6view1 | `/Z` (Z80 mnemonics), `/I` (8080 mnemonics) citeturn13view1 | No CLI CPU mode flags |
| Include path | `-i/-I/--inc` citeturn6view1 | No CLI include-path option (switch `/I` is 8080 mode) citeturn13view1 | No CLI include-path option |
| Listing output | `--lst[=<file>]` citeturn6view1 | `/L` generates PRN listing citeturn13view1 | Always writes `.lst` (no CLI toggle) |
| Symbol / export output | `--sym`, `--exp` citeturn6view1 | `/C` generates CRF for CREF utility citeturn13view1 | Always writes `.sym` (no CLI toggle) |
| HEX / raw output | `--hex`, `--raw` citeturn6view1 | REL output only; uses Link-80 for final COM/SYS citeturn13view3 | REL output only (v1/v2) |
| Conditional listing control | `--msg=lst/lstlab` (listing to stderr) citeturn6view2 | `/X` suppresses listing of false conditionals citeturn13view0 | No CLI flag |

### M80 Switch Details (from Utility Software Package manual)
- `/O`: octal listing addresses (list file) citeturn6view0
- `/H`: hex listing addresses (default) citeturn6view0
- `/R`: force REL object file output (even if object filename omitted) citeturn6view0
- `/L`: force listing (PRN) file output (even if list filename omitted) citeturn6view2
- `/C`: generate CREF-80 cross-reference file citeturn6view3
- `/Z`: assemble Z80 opcodes (if `.Z80` not used) citeturn6view3
- `/I`: assemble 8080 opcodes (default) citeturn6view3
- `/P`: add 256 bytes of stack for assembly (repeatable) citeturn6view3
- `/M`: initialize DS/DEFS blocks to zero citeturn6view3
- `/X`: suppress listing of false conditional blocks citeturn6view3

### Pseudo-op Comparison (sjasmplus / M80 / mz80)
| Category | sjasmplus (documented) | M80 (documented) | mz80 (implemented) |
| --- | --- | --- | --- |
| Core data | `DB/DEFB`, `DW/DEFW`, `DEFS/DS`, `DEFM`, `DEFL`, `EQU` etc. citeturn1view3 | `DB/DEFB/DEFW/DEFS/DS/DW`, `DEFM`, `DEFL`, `EQU`, `DC` citeturn4view2 | `DB/DEFB`, `DW/DEFW`, `DS/DEFS`, `DZ`, `EQU`, `SET` |
| Include | `INCLUDE`, `INCBIN`, `INSERT` and related include directives citeturn1view3 | `$INCLUDE`, `INCLUDE` citeturn4view2 | `INCLUDE` (string path only) |
| Conditionals | `IF/ELSEIF/ELSE/ENDIF`, `IFDEF/IFNDEF`, `IFN` etc. citeturn1view3 | `IF/ELSE/ENDIF/ENDC`, `IFDEF/IFNDEF`, `IFDIF`, `IFB/IFNB`, `IFIDN` etc. citeturn4view2 | `IF/ELSEIF/ELSE/ENDIF`, `IFIDN` |
| Macro / repeat | `MACRO/ENDM`, `REPT` (via DUP), `WHILE` citeturn1view3 | `MACRO/ENDM`, `IRP/IRPC`, `EXITM` citeturn4view2 | `MACRO/ENDM`, `REPT/REPEAT`, `IRP/IRPC`, `WHILE/ENDW`, `LOCALMACRO` |
| Segments / scope | `MODULE`, `ORG`, `PHASE/DISP`, device/page directives (many) citeturn1view3 | `ASEG/CSEG/DSEG`, `COMMON`, `GLOBAL`, `LOCAL`, `ORG` citeturn4view2 | `SECTION`, `ALIGN`, `ORG` |

### Pseudo-op Checklist (Supported / Missing / Alternative)
| Pseudo-op | sjasmplus | M80 | mz80 | Alternative / Note |
| --- | --- | --- | --- | --- |
| `ORG` | ✅ | ✅ | ✅ |  |
| `EQU` | ✅ | ✅ | ✅ |  |
| `SET` / `DEFL` | ✅ (`DEFL`) | ✅ (`DEFL`) citeturn4view2 | ✅ (`SET`) | `DEFL` not implemented; use `SET` (semantics may differ) |
| `DB/DEFB` | ✅ | ✅ | ✅ |  |
| `DW/DEFW` | ✅ | ✅ | ✅ |  |
| `DS/DEFS` | ✅ | ✅ | ✅ |  |
| `DEFM` / `DC` | ✅ (`DEFM`) citeturn1view3 | ✅ (`DEFM`, `DC`) citeturn4view2 | ❌ | Use `DB "string"` |
| `DZ` | ✅ citeturn1view3 | (not listed) citeturn4view2 | ✅ |  |
| `INCLUDE` | ✅ | ✅ citeturn4view2 | ✅ |  |
| `INCBIN` / `INSERT` | ✅ citeturn1view3 | (not listed) citeturn4view2 | ❌ |  |
| `IF/ELSE/ENDIF` | ✅ citeturn1view3 | ✅ citeturn4view2 | ✅ |  |
| `IFDEF/IFNDEF` | ✅ citeturn1view3 | ✅ citeturn4view2 | ❌ |  |
| `IFB/IFNB` | ✅ (sjasmplus) citeturn1view3 | ✅ citeturn4view2 | ❌ |  |
| `IFDIF/IFIDN` | ✅ citeturn1view3 | ✅ citeturn4view2 | ✅ (`IFIDN` only) | `IFDIF` missing |
| `MACRO/ENDM` | ✅ | ✅ | ✅ |  |
| `IRP/IRPC` | ✅ (sjasmplus) citeturn1view3 | ✅ citeturn4view2 | ✅ |  |
| `REPT/WHILE` | ✅ citeturn1view3 | (not listed) citeturn4view2 | ✅ |  |
| `EXITM` | ✅ (sjasmplus) citeturn1view3 | ✅ citeturn4view2 | ❌ |  |
| `GLOBAL/LOCAL` | ✅ (sjasmplus) citeturn1view3 | ✅ citeturn4view2 | ❌ | Only `LOCALMACRO` exists (not symbol scope) |
| `ASEG/CSEG/DSEG` | ❌ (uses `MODULE`/`PAGE`) citeturn1view3 | ✅ citeturn4view2 | ❌ | Use `SECTION <name>` |
| `TITLE/PAGE/LIST` | ✅ (various) citeturn1view3 | ✅ (`$TITLE`, `.LIST/.XLIST`) citeturn4view2 | ❌ |  |
| `EXTRN/EXTERNAL/EXT` | ✅ (EXPORT/EXTERN variants) citeturn1view3 | ✅ citeturn4view2 | ✅ (`EXTERN`) | Use `EXTERN` |

## Listings / Output
- .lst formatting parity for macro-expanded sources
  - Source: `packages/cli/src/assembler-old/__tests__/lst_output.test.ts`
