// Z80 Assembler Grammar for PEG.js (Fixed)

{
  function makeNode(type, props, loc) {
    return { type, pos: loc, ...props };
  }

  function withRaw(node, raw) {
    if (node && typeof node === "object") return { ...node, raw };
    return node;
  }

  function foldBinary(first, rest) {
    return rest.reduce((left, part) => {
      const op = part[1];
      const right = part[3];
      return makeNode('binaryOp', { op, left, right }, location());
    }, first);
  }

  function splitArgs(raw) {
    if (!raw) return [];
    return raw.split(",").map(s => s.trim()).filter(s => s.length > 0);
  }
}

Start
  = BOM? items:(Block / Line / EmptyLine)* tail:LineNoEOL? EOF {
      const list = tail ? [...items, tail] : items;
      return list.filter(l => l !== null);
    }

BOM
  = "\uFEFF"

Block
  = MacroDef
  / MacroLoop
  / UnterminatedMacroDef

Line
  = _ label:Label? _ instruction:Instruction? _ comment:Comment? EOL {
      if (!label && !instruction) return makeNode('empty', {}, location());
      return makeNode('line', { label, instruction, comment }, location());
    }

LineNoEOL
  = _ label:Label? _ instruction:Instruction? _ comment:Comment? EOF {
      if (!label && !instruction) return makeNode('empty', {}, location());
      return makeNode('line', { label, instruction, comment }, location());
    }

EmptyLine
  = _ EOL { return makeNode('empty', {}, location()); }

Label
  = name:(Identifier / DotIdentifier / ReservedWordIdent / ExtendedMnemonicIdent) &(_ ":" ! "=") _ ":" {
      return makeNode('label', { name: name.name, colon: true }, location());
    }
  / name:DotIdentifier &(__ Instruction) __ {
      return makeNode('label', { name: name.name, colon: false }, location());
    }
  / name:DotIdentifier &(_ Comment? EOL) {
      return makeNode('label', { name: name.name, colon: false }, location());
    }
  / name:Identifier &(__ ! "." NonMacroInstruction) __ {
      return makeNode('label', { name: name.name, colon: false }, location());
    }

Instruction
  = Directive
  / OpCode
  / MacroInvoke

NonMacroInstruction
  = Directive
  / OpCode

// ディレクティブ
  Directive
    = OrgDirective
    / DbDirective
    / DzDirective
    / DwDirective
    / DsDirective
    / DeflDirective
    / DefmDirective
    / DcDirective
    / EquDirectiveLabel
    / EquDirective
    / SetDirective
    / EndDirective
    / IfDirective
    / ElseIfDirective
    / ElseDirective
    / EndIfDirective
    / IfIdnDirective
    / ExternDirective
    / ExtDirective
    / ExternalDirective
    / SectionDirective
    / IncludeDirective
    / IncPathDirective
    / AlignDirective
    / SymLenDirective
  / Word32Directive
  / GenericDotDirective

OrgDirective
  = "ORG"i __ addr:Expression {
      return makeNode('directive', { name: 'ORG', value: addr }, location());
    }

DbDirective
  = op:("DB"i / "DEFB"i) __ values:ExpressionList {
      return makeNode('directive', { name: op.toUpperCase(), values }, location());
    }

DzDirective
  = "DZ"i __ values:ExpressionList {
      return makeNode('directive', { name: 'DZ', values }, location());
    }

DwDirective
  = op:("DW"i / "DEFW"i) __ values:ExpressionList {
      return makeNode('directive', { name: op.toUpperCase(), values }, location());
    }

  DsDirective
    = op:("DS"i / "DEFS"i) __ size:Expression {
        return makeNode('directive', { name: op.toUpperCase(), size }, location());
      }

  DeflDirective
    = name:SymbolIdentifier __ "DEFL"i __ value:Expression {
        return makeNode('directive', { name: 'DEFL', symbol: name.name, value }, location());
      }

  DefmDirective
    = "DEFM"i __ values:ExpressionList {
        return makeNode('directive', { name: 'DEFM', values }, location());
      }

  DcDirective
    = "DC"i __ values:ExpressionList {
        return makeNode('directive', { name: 'DC', values }, location());
      }

EquDirective
  = name:SymbolIdentifier __ "EQU"i __ value:Expression {
      return makeNode('directive', { name: 'EQU', symbol: name.name, value }, location());
    }

EquDirectiveLabel
  = "EQU"i __ value:Expression {
      return makeNode('directive', { name: 'EQU', symbol: null, value }, location());
    }

SetDirective
  = name:SymbolIdentifier _ ":=" _ value:Expression {
      return makeNode('directive', { name: 'SET', symbol: name.name, value }, location());
    }

EndDirective
  = "END"i !IdentifierPart value:(_ Expression)? {
      return makeNode('directive', { name: 'END', value: value ? value[1] : null }, location());
    }

IfDirective
  = "IF"i __ value:Expression {
      return makeNode('directive', { name: 'IF', value }, location());
    }

ElseIfDirective
  = "ELSEIF"i __ value:Expression {
      return makeNode('directive', { name: 'ELSEIF', value }, location());
    }

ElseDirective
  = "ELSE"i {
      return makeNode('directive', { name: 'ELSE' }, location());
    }

EndIfDirective
  = "ENDIF"i {
      return makeNode('directive', { name: 'ENDIF' }, location());
    }

IfIdnDirective
  = "IFIDN"i __ left:IfIdnArg _ "," _ right:IfIdnArg {
      return makeNode('directive', { name: 'IFIDN', left, right }, location());
    }

  ExternDirective
    = "EXTERN"i __ symbols:IdentifierList fromClause:(_ "FROM"i _ (StringLiteral / Identifier))? {
        const from = fromClause ? fromClause[3] : undefined;
        return makeNode('directive', {
          name: 'EXTERN',
          symbols: symbols.map(s => s.name),
          from,
        }, location());
      }

  ExtDirective
    = "EXT"i __ symbols:IdentifierList {
        return makeNode('directive', { name: 'EXT', symbols: symbols.map(s => s.name) }, location());
      }

  ExternalDirective
    = "EXTERNAL"i __ symbols:IdentifierList {
        return makeNode('directive', { name: 'EXTERNAL', symbols: symbols.map(s => s.name) }, location());
      }

SectionDirective
  = "SECTION"i __ name:Identifier opts:SectionOpts? {
      return makeNode('directive', { name: 'SECTION', section: name.name, ...opts }, location());
    }

SectionOpts
  = _ "," _ opt:SectionOpt { return opt; }

SectionOpt
  = "ALIGN"i _ "=" _ value:Expression { return { align: value }; }

IncludeDirective
  = "INCLUDE"i __ path:IncludePath {
      return makeNode('directive', { name: 'INCLUDE', path }, location());
    }

IncPathDirective
  = "INCPATH"i __ paths:IncludePathList {
      return makeNode('directive', { name: 'INCPATH', paths }, location());
    }

IncludePath
  = StringLiteral
  / IncludeBare

IncludePathList
  = first:IncludePath rest:(_ "," _ IncludePath)* {
      return [first, ...rest.map(r => r[3])];
    }

IncludeBare
  = raw:$([^;\r\n]+) {
      return makeNode('string', { value: raw.trim() }, location());
    }

AlignDirective
  = "ALIGN"i __ value:Expression {
      return makeNode('directive', { name: 'ALIGN', value }, location());
    }

SymLenDirective
  = ".SYMLEN"i __ value:Expression {
      return makeNode('directive', { name: '.SYMLEN', value }, location());
    }
  / ".SYMLEN"i {
      return makeNode('directive', { name: '.SYMLEN', value: null }, location());
    }

Word32Directive
  = ".WORD32"i {
      return makeNode('directive', { name: '.WORD32' }, location());
    }

GenericDotDirective
  = name:DotIdentifier args:(_ (StringLiteral / Expression))? {
      const values = args ? [args[1]] : [];
      return makeNode('directive', { name: name.name, values }, location());
    }

// マクロ定義/呼び出し
MacroDef
  = _ name:MacroName __ "MACRO"i params:MacroParams? _ comment:Comment? EOL body:MacroBody EndmLine {
      return makeNode('macroDef', { name, params: params ?? [], body }, location());
    }
  / _ "MACRO"i __ name:MacroName params:MacroParams? _ comment:Comment? EOL body:MacroBody EndmLine {
      return makeNode('macroDef', { name, params: params ?? [], body }, location());
    }

UnterminatedMacroDef
  = _ name:MacroName __ "MACRO"i params:MacroParams? _ comment:Comment? EOL body:MacroBody EOF {
      throw new Error("ENDM missing");
    }
  / _ "MACRO"i __ name:MacroName params:MacroParams? _ comment:Comment? EOL body:MacroBody EOF {
      throw new Error("ENDM missing");
    }

MacroParams
  = __ list:MacroParamList { return list; }
  / _ "(" _ list:MacroParamList? _ ")" { return list ?? []; }

MacroParamList
  = first:MacroParam rest:(_ "," _ MacroParam)* {
      return [first, ...rest.map(r => r[3])];
    }

  MacroParam
    = name:MacroParamName def:(_ ":" _ Expression)? {
        return def ? { name, default: def[3] } : { name };
      }

MacroBody
  = parts:(LocalMacroBlock / NestedRept / NestedIrp / NestedIrpc / NestedWhile / MacroLine)* { return parts.join(""); }

MacroLine
  = !EndmLine !EndrLine !EndwLine text:$([^\r\n]*) EOL { return text + "\n"; }

NestedRept
  = text:$(_ ("REPEAT"i / "REPT"i) __ [^\r\n]* EOL body:MacroBody EndrLineNested) { return text; }

NestedIrp
  = text:$(_ "IRP"i __ [^\r\n]* EOL body:MacroBody EndmLine) { return text; }

NestedIrpc
  = text:$(_ "IRPC"i __ [^\r\n]* EOL body:MacroBody EndmLine) { return text; }

NestedWhile
  = text:$(_ "WHILE"i __ [^\r\n]* EOL body:MacroBody EndwLine) { return text; }

EndmLine
  = _ "ENDM"i _ Comment? (EOL / EOF) { return; }

EndrLine
  = _ ("ENDREPEAT"i / "ENDR"i / "ENDM"i) _ Comment? (EOL / EOF) { return; }

  EndrLineNested
    = _ ("ENDREPEAT"i / "ENDR"i / "ENDM"i) _ Comment? (EOL / EOF) { return; }

EndwLine
  = _ "ENDW"i _ Comment? (EOL / EOF) { return; }

LocalMacroBlock
  = text:$(_ "LOCALMACRO"i [^\r\n]* EOL body:MacroBody EndmLine) { return text; }

MacroInvoke
  = name:MacroName args:MacroInvokeArgs? {
      return makeNode('macroInvoke', { name, args: args ?? [] }, location());
    }

MacroInvokeArgs
  = __ list:MacroArgList { return list; }
  / _ "(" _ list:MacroArgList? _ ")" { return list ?? []; }

MacroArgList
  = first:MacroArg? rest:(_ "," _ MacroArg?)+ {
      const head = first ?? "";
      return [head, ...rest.map(r => r[3] ?? "")];
    }
  / first:MacroArg rest:(_ "," _ MacroArg?)* {
      return [first, ...rest.map(r => r[3] ?? "")];
    }

MacroArg
  = s:StringLiteral { return s.raw ?? `"${s.value ?? ""}"`; }
  / raw:$([^,\r\n;)]+) { return raw.trim(); }

// マクロループ
MacroLoop
  = ReptBlock
  / IrpBlock
  / IrpcBlock
  / WhileBlock

ReptBlock
  = _ op:("REPEAT"i / "REPT"i) __ count:Expression _ Comment? EOL body:MacroBody EndrLine {
      return makeNode('macroLoop', { op: 'REPT', count, body }, location());
    }

IrpBlock
  = _ "IRP"i __ symbol:Identifier _ "," _ args:MacroArgList? _ Comment? EOL body:MacroBody EndmLine {
      return makeNode('macroLoop', { op: 'IRP', symbol: symbol.name, args: args ?? [], body }, location());
    }

IrpcBlock
  = _ "IRPC"i __ symbol:Identifier _ "," _ str:StringLiteral _ Comment? EOL body:MacroBody EndmLine {
      return makeNode('macroLoop', { op: 'IRPC', symbol: symbol.name, str, body }, location());
    }

WhileBlock
  = _ "WHILE"i __ cond:Expression _ Comment? EOL body:MacroBody EndwLine {
      return makeNode('macroLoop', { op: 'WHILE', cond, body }, location());
    }

// オペコード
OpCode
  = LoadInstruction
  / ArithmeticInstruction
  / LogicInstruction
  / RotateShiftInstruction
  / BitInstruction
  / JumpInstruction
  / CallRetInstruction
  / StackInstruction
  / IoInstruction
  / MiscInstruction
  / ExtendedInstruction

// LD命令
LoadInstruction
  = "LD"i __ dest:Operand _ "," _ src:Operand {
      return makeNode('instruction', { mnemonic: 'LD', operands: [dest, src] }, location());
    }

// 算術演算命令
ArithmeticInstruction
  = mnemonic:("ADD"i / "ADC"i / "SUB"i / "SBC"i / "INC"i / "DEC"i / "CP"i) __ operands:OperandList {
      return makeNode('instruction', { mnemonic: mnemonic.toUpperCase(), operands }, location());
    }

// 論理演算命令
LogicInstruction
  = mnemonic:("AND"i / "OR"i / "XOR"i) __ operand:Operand {
      return makeNode('instruction', { mnemonic: mnemonic.toUpperCase(), operands: [operand] }, location());
    }

// ローテート・シフト命令
RotateShiftInstruction
  = mnemonic:("RLC"i / "RRC"i / "RL"i / "RR"i / "SLA"i / "SRA"i / "SLL"i / "SRL"i) __ operand:Operand {
      return makeNode('instruction', { mnemonic: mnemonic.toUpperCase(), operands: [operand] }, location());
    }
  / mnemonic:("RLCA"i / "RRCA"i / "RLA"i / "RRA"i) {
      return makeNode('instruction', { mnemonic: mnemonic.toUpperCase(), operands: [] }, location());
    }

// ビット操作命令
BitInstruction
  = mnemonic:("BIT"i / "SET"i / "RES"i) __ bit:Expression _ "," _ operand:Operand {
      return makeNode('instruction', { mnemonic: mnemonic.toUpperCase(), operands: [bit, operand] }, location());
    }

// ジャンプ命令
JumpInstruction
  = "JP"i __ condition:Condition _ "," _ addr:Operand {
      return makeNode('instruction', { mnemonic: 'JP', condition, operands: [addr] }, location());
    }
  / "JP"i __ addr:Operand {
      return makeNode('instruction', { mnemonic: 'JP', operands: [addr] }, location());
    }
  / "JR"i __ condition:Condition _ "," _ offset:Operand {
      return makeNode('instruction', { mnemonic: 'JR', condition, operands: [offset] }, location());
    }
  / "JR"i __ offset:Operand {
      return makeNode('instruction', { mnemonic: 'JR', operands: [offset] }, location());
    }
  / "DJNZ"i __ offset:Operand {
      return makeNode('instruction', { mnemonic: 'DJNZ', operands: [offset] }, location());
    }

// CALL/RET命令
CallRetInstruction
  = "CALL"i __ condition:Condition _ "," _ addr:Operand {
      return makeNode('instruction', { mnemonic: 'CALL', condition, operands: [addr] }, location());
    }
  / "CALL"i __ addr:Operand {
      return makeNode('instruction', { mnemonic: 'CALL', operands: [addr] }, location());
    }
  / "RET"i __ condition:Condition {
      return makeNode('instruction', { mnemonic: 'RET', condition, operands: [] }, location());
    }
  / "RET"i {
      return makeNode('instruction', { mnemonic: 'RET', operands: [] }, location());
    }
  / mnemonic:("RETI"i / "RETN"i) {
      return makeNode('instruction', { mnemonic: mnemonic.toUpperCase(), operands: [] }, location());
    }
  / "RST"i __ addr:Expression {
      return makeNode('instruction', { mnemonic: 'RST', operands: [addr] }, location());
    }

// スタック操作命令
StackInstruction
  = mnemonic:("PUSH"i / "POP"i) __ operand:Register16 {
      return makeNode('instruction', { mnemonic: mnemonic.toUpperCase(), operands: [operand] }, location());
    }

// I/O命令
IoInstruction
  = "IN"i __ dest:Register8 _ "," _ "(" _ port:PortOperand _ ")" {
      return makeNode('instruction', { mnemonic: 'IN', operands: [dest, makeNode('indirect', { operand: port }, location())] }, location());
    }
  / "IN"i __ "(" _ "C"i _ ")" {
      return makeNode('instruction', {
        mnemonic: 'IN',
        operands: [makeNode('indirect', { operand: makeNode('register', { name: 'C' }, location()) }, location())],
      }, location());
    }
  / "OUT"i __ "(" _ port:PortOperand _ ")" _ "," _ src:Register8 {
      return makeNode('instruction', { mnemonic: 'OUT', operands: [makeNode('indirect', { operand: port }, location()), src] }, location());
    }
  / "OUT"i __ "(" _ "C"i _ ")" _ "," _ src:Expression {
      return makeNode('instruction', {
        mnemonic: 'OUT',
        operands: [
          makeNode('indirect', { operand: makeNode('register', { name: 'C' }, location()) }, location()),
          src,
        ],
      }, location());
    }

// その他の命令
MiscInstruction
  = mnemonic:("NOP"i / "HALT"i / "DI"i / "EI"i / "NEG"i / "CPL"i / "CCF"i / "SCF"i / "DAA"i /
              "LDIR"i / "LDI"i / "LDDR"i / "LDD"i /
              "CPIR"i / "CPI"i / "CPDR"i / "CPD"i /
              "INIR"i / "INI"i / "INDR"i / "IND"i /
              "OTIR"i / "OUTI"i / "OTDR"i / "OUTD"i /
              "RRD"i / "RLD"i) {
      return makeNode('instruction', { mnemonic: mnemonic.toUpperCase(), operands: [] }, location());
    }
  / "IM"i __ mode:Expression {
      return makeNode('instruction', { mnemonic: 'IM', operands: [mode] }, location());
    }
  / "EX"i __ op1:Operand _ "," _ op2:Operand {
      return makeNode('instruction', { mnemonic: 'EX', operands: [op1, op2] }, location());
    }
  / "EXX"i {
      return makeNode('instruction', { mnemonic: 'EXX', operands: [] }, location());
    }

// Extended ISA (R800/Z280 etc.)
ExtendedInstruction
  = mnemonic:("MULUB"i / "MULUW"i / "MULT"i / "MULTU"i / "MULTW"i / "DIV"i / "DIVU"i /
              "JAF"i / "JAR"i / "LDUP"i / "LOUD"i /
              "SLP"i / "MLT"i / "IN0"i / "OUT0"i / "INO"i / "OUTO"i /
              "OTIM"i / "OTIMR"i / "OTDM"i / "OTDMR"i / "TSTIO"i / "TST"i) tail:(_ $[^;\r\n]*)? {
      const args = tail ? splitArgs(tail[1]) : [];
      return makeNode('instruction', { mnemonic: mnemonic.toUpperCase(), operands: args }, location());
    }

// オペランド
OperandList
  = first:Operand rest:(_ "," _ Operand)* {
      return [first, ...rest.map(r => r[3])];
    }

Operand
  = op:(IndirectIndexed / Indirect / Register16 / Register8 / Expression) {
      return withRaw(op, text());
    }

Indirect
  = "(" _ operand:(Register16 / Expression) _ ")" !(_ ExprOpStart) {
      return makeNode('indirect', { operand }, location());
    }

ExprOpStart
  = ("<<" / ">>" / "<=" / ">=" / "==" / "!=" / [+\-*/%<>^&|])

IndirectIndexed
  = "(" _ base:("IX"i / "IY"i) offset:(_ [+\-] _ Expression)? _ ")" {
      return makeNode('indexedIndirect', { 
        base: base.toUpperCase(), 
        offset: offset ? { sign: offset[1], value: offset[3] } : null 
      }, location());
    }

PortOperand
  = "C"i { return makeNode('register', { name: 'C' }, location()); }
  / Expression

// レジスタ
Register8
  = name:("A"i / "B"i / "C"i / "D"i / "E"i / "H"i / "L"i / "F"i / "I"i / "R"i /
          "IXH"i / "IXL"i / "IYH"i / "IYL"i) !IdentifierPart {
      return makeNode('register', { name: name.toUpperCase() }, location());
    }

Register16
  = name:("AF'"i / "AF"i / "BC"i / "DE"i / "HL"i / "IX"i / "IY"i / "SP"i) !IdentifierPart {
      return makeNode('register', { name: name.toUpperCase() }, location());
    }

// 条件
Condition
  = name:("NZ"i / "NC"i / "PO"i / "PE"i / "Z"i / "C"i / "P"i / "M"i) !IdentifierPart {
      return name.toUpperCase();
    }

// 式
ExpressionList
  = first:Expression rest:(_ "," _ Expression)* {
      return [first, ...rest.map(r => r[3])];
    }

Expression
  = expr:OrExpr { return withRaw(expr, text()); }

OrExpr
  = left:XorExpr rest:(_ "|" _ XorExpr)* { return foldBinary(left, rest); }

XorExpr
  = left:AndExpr rest:(_ "^" _ AndExpr)* { return foldBinary(left, rest); }

AndExpr
  = left:EqualityExpr rest:(_ "&" _ EqualityExpr)* { return foldBinary(left, rest); }

EqualityExpr
  = left:RelExpr rest:(_ ("==" / "!=") _ RelExpr)* { return foldBinary(left, rest); }

RelExpr
  = left:ShiftExpr rest:(_ ("<=" / ">=" / "<" / ">") _ ShiftExpr)* { return foldBinary(left, rest); }

ShiftExpr
  = left:Additive rest:(_ ("<<" / ">>") _ Additive)* { return foldBinary(left, rest); }

Additive
  = left:Multiplicative rest:(_ [+\-] _ Multiplicative)* { return foldBinary(left, rest); }

Multiplicative
  = left:Unary rest:(_ [*/%] _ Unary)* { return foldBinary(left, rest); }

Unary
  = op:([+\-] / "~" / "!") _ expr:Unary {
      return makeNode('unaryOp', { op, expr }, location());
    }
  / Primary

Primary
  = "(" _ expr:Expression _ ")" { return expr; }
  / StringLiteral
  / HexNumber
  / BinaryNumber
  / DecimalNumber
  / AtCounter
  / CurrentAddress
  / ExprIdentifier

ExprIdentifier
  = Identifier
  / DotIdentifier
  / ReservedWordIdent
  / ExtendedMnemonicIdent

AtCounter
  = "@#" {
      return makeNode('identifier', { name: 'COUNTER' }, location());
    }

CurrentAddress
  = "$" !HexDigit { return makeNode('currentAddress', {}, location()); }

// 数値リテラル
HexNumber
  = "0x"i value:$(HexDigit+) !IdentifierPart {
      return makeNode('number', { base: 16, value: parseInt(value, 16) }, location());
    }
  / "$" value:$(HexDigit+) !IdentifierPart {
      return makeNode('number', { base: 16, value: parseInt(value, 16) }, location());
    }
  / value:$(HexDigit+) "H"i !IdentifierPart {
      return makeNode('number', { base: 16, value: parseInt(value, 16) }, location());
    }

BinaryNumber
  = "0b"i value:$([01]+) !IdentifierPart {
      return makeNode('number', { base: 2, value: parseInt(value, 2) }, location());
    }
  / value:$([01]+) "B"i !IdentifierPart {
      return makeNode('number', { base: 2, value: parseInt(value, 2) }, location());
    }

DecimalNumber
  = value:$([0-9]+) !IdentifierPart {
      return makeNode('number', { base: 10, value: parseInt(value, 10) }, location());
    }

HexDigit
  = [0-9A-Fa-f]

// 文字列リテラル
StringLiteral
  = "\"" chars:$((EscapedChar / [^\"\r\n])*) "\"" {
      return withRaw(makeNode('string', { value: chars }, location()), text());
    }
  / "'" chars:$((EscapedChar / [^'\r\n])*) "'" {
      return withRaw(makeNode('string', { value: chars }, location()), text());
    }

EscapedChar
  = "\\" [^\r\n]

// 識別子
Identifier
  = !ReservedWord !ExtendedMnemonic name:$([A-Za-z_@][A-Za-z0-9_@]* ("." [A-Za-z0-9_@]+)*) {
      return makeNode('identifier', { name }, location());
    }

DotIdentifier
  = "." name:$([A-Za-z_@][A-Za-z0-9_@]*) {
      return makeNode('identifier', { name: "." + name }, location());
    }

ReservedWordIdent
  = name:$(ReservedWord) {
      return makeNode('identifier', { name }, location());
    }

ExtendedMnemonicIdent
  = name:$(ExtendedMnemonic) {
      return makeNode('identifier', { name }, location());
    }

SymbolIdentifier
  = Identifier
  / DotIdentifier

IfIdnArg
  = StringLiteral
  / SymbolIdentifier

  MacroName
    = name:$([A-Za-z_][A-Za-z0-9_]*) { return name; }

  MacroParamName
    = name:$([A-Za-z_@][A-Za-z0-9_@]* ("." [A-Za-z0-9_@]+)*) { return name; }

IdentifierList
  = first:Identifier rest:(_ "," _ Identifier)* {
      return [first, ...rest.map(r => r[3])];
    }

IdentifierPart
  = [A-Za-z0-9_.@]

// 予約語
ReservedWord
  = ("ORG"i / "DB"i / "DEFB"i / "DZ"i / "DW"i / "DEFW"i / "DS"i / "DEFS"i / "EQU"i / "SET"i / "END"i /
     "IF"i / "ELSEIF"i / "ELSE"i / "ENDIF"i / "IFIDN"i / "IFDIF"i / "IFDEF"i / "IFNDEF"i / "IFB"i / "IFNB"i /
     "EXTERN"i / "EXTERNAL"i / "SECTION"i / "INCLUDE"i / "INCPATH"i / "ALIGN"i / ".SYMLEN"i / ".WORD32"i /
     "DEFL"i / "DEFM"i / "DC"i / "GLOBAL"i / "PUBLIC"i / "LOCAL"i / "ASEG"i / "CSEG"i / "DSEG"i / "COMMON"i /
     "LIST"i / "PAGE"i / "TITLE"i / "EXITM"i /
     "MACRO"i / "ENDM"i / "REPT"i / "REPEAT"i / "ENDR"i / "WHILE"i / "ENDW"i / "IRP"i / "IRPC"i / "LOCALMACRO"i /
     "LD"i / "ADD"i / "ADC"i / "SUB"i / "SBC"i / "INC"i / "DEC"i / "CP"i /
     "AND"i / "OR"i / "XOR"i / "RLC"i / "RRC"i / "RL"i / "RR"i / 
     "SLA"i / "SRA"i / "SLL"i / "SRL"i / "RLCA"i / "RRCA"i / "RLA"i / "RRA"i /
     "BIT"i / "SET"i / "RES"i / "JP"i / "JR"i / "DJNZ"i / 
     "CALL"i / "RET"i / "RETI"i / "RETN"i / "RST"i /
     "PUSH"i / "POP"i / "IN"i / "OUT"i / "NOP"i / "HALT"i / 
     "DI"i / "EI"i / "NEG"i / "CPL"i / "CCF"i / "SCF"i / "DAA"i / 
     "LDI"i / "LDIR"i / "LDD"i / "LDDR"i /
     "CPI"i / "CPIR"i / "CPD"i / "CPDR"i /
     "INI"i / "INIR"i / "IND"i / "INDR"i /
     "OUTI"i / "OTIR"i / "OUTD"i / "OTDR"i /
     "RRD"i / "RLD"i /
     "EX"i / "EXX"i / "F"i) !IdentifierPart

ExtendedMnemonic
  = ("MULUB"i / "MULUW"i / "MULT"i / "MULTU"i / "MULTW"i / "DIV"i / "DIVU"i /
     "JAF"i / "JAR"i / "LDUP"i / "LOUD"i /
     "SLP"i / "MLT"i / "IN0"i / "OUT0"i / "INO"i / "OUTO"i /
     "OTIM"i / "OTIMR"i / "OTDM"i / "OTDMR"i / "TSTIO"i / "TST"i) !IdentifierPart

// コメント
Comment
  = ";" text:$([^\r\n]*) {
      return makeNode('comment', { text }, location());
    }

// 空白（必須）
__
  = [ \t]+ { return; }

// 空白（オプション）
_
  = [ \t]* { return; }

// 行末
EOL
  = "\r\n" / "\r" / "\n"

// ファイル終端
EOF
  = !.
