{
  // ======== Helper Functions ========
  function pos(location) {
    return { offset: location().start.offset, line: location().start.line, column: location().start.column };
  }
  function node(kind, props, location) {
    return Object.assign({ kind, pos: pos(location) }, props);
  }
  function flat(arr) { return Array.prototype.concat.apply([], arr); }
}

// ======== INCLUDE命令群 ========
@include "z80_mnemonics.peginc"

// ======== Top-Level ========

Start
  = BOM? WS* lines:(AnyLine WS*)* {
      return node("Program", { body: lines.flat().filter(Boolean) }, location);
    }

// すべての行を包括
AnyLine
  = CommentLine
  / MacroDef
  / ReptBlock
  / LabelStmt
  / Directive
  / Instruction
  / EmptyLine

// ======== コメント・空行 ========

CommentLine
  = _? ";" [^\n\r]* NL? { return null; }

EmptyLine
  = _? NL { return null; }

// ======== ラベル付き命令・ディレクティブ ========

LabelStmt
  = label:Ident ":" _ stmt:(Directive / Instruction / MacroCall)? {
      if (stmt)
        return node("Labeled", { label, stmt }, location);
      return node("Label", { label }, location);
    }

// ======== MACRO ========

MacroDef
  = "MACRO"i __ name:Ident params:MacroParams? NL
    body:BlockLines
    _ "ENDM"i {
      return node("MacroDef", { name, params: params || [], body }, location);
    }

BlockLines
  = lines:(BlockLine)* { return lines.filter(Boolean); }

BlockLine
  = !("ENDM"i / "ENDR"i) line:AnyLine { return line; }

MacroParams
  = _ "(" _ list:IdentList _ ")" { return list; }

MacroCall
  = name:Ident _ "(" _ args:ExprList? _ ")" {
      return node("MacroCall", { name, args: args || [] }, location);
    }

// ======== REPT ========

ReptBlock
  = "REPT"i __ count:Integer NL
    body:BlockLines
    _ ("ENDM"i / "ENDR"i) {
      return node("Rept", { count: parseInt(count, 10), body }, location);
    }

Integer
  = n:$([0-9]+) { return n; }

// ======== Directives / Instructions ========

Directive
  = name:PseudoInstr __ args:DirectiveArgs? {
      return node("Directive", { name: name.name ?? name, args: args || [] }, location);
    }
  / "." name:Ident __ args:DirectiveArgs? {
      return node("Directive", { name, args: args || [] }, location);
    }

DirectiveArgs
  = ExprList

Instruction
  = mnemonic:RealInstr operands:(__ OperandList)? {
      return node("Instruction", {
        mnemonic: mnemonic.name ?? mnemonic,
        operands: operands ? operands[1] : []
      }, location);
    }

// ======== Operands ========

OperandList
  = head:Operand tail:(_ "," _ Operand)* {
      const all = [head];
      for (const t of tail) all.push(t[3]);
      return all;
    }

Operand
  = "(" _ r:Register _ ")" { return node("Indirect", { reg: r.name }, location); }
  / r:Register { return r; }
  / n:NumberLiteral { return n; }
  / id:Identifier { return id; }  

// ======== Literals ========

NumberLiteral
  = Hex / Bin / SuffixedHex / Dec

Dec
  = !Hex !Bin !SuffixedHex n:$([0-9]+) !([a-zA-Z_]) { 
      return node("NumberLiteral", { base:10, value: parseInt(n,10) }, location); 
    }

Hex
  = ("0x" / "0X") n:$([0-9a-fA-F]+) { 
      return node("NumberLiteral", { base:16, value: parseInt(n,16) }, location); 
    }

Bin
  = ("0b" / "0B") n:$([01]+) { 
      return node("NumberLiteral", { base:2, value: parseInt(n,2) }, location); 
    }

SuffixedHex
  = n:$([0-9A-Fa-f]+) ("h"i / "H") { 
      return node("NumberLiteral", { base:16, value: parseInt(n,16) }, location); 
    }

// ======== Registers ========

Register
  = name:$("AF"i / "BC"i / "DE"i / "HL"i / "IX"i / "IY"i / "SP"i / [A-EHL]i) !([a-zA-Z0-9_])
    { return node("Register", { name: name.toUpperCase() }, location); }

// ======== Identifiers ========

Identifier
  = !Register name:$([a-zA-Z_][a-zA-Z0-9_]*)
    { return node("Identifier", { name }, location); }

// ======== Expressions ========

ExprList
  = head:Expr tail:(_ "," _ Expr)* { return [head].concat(tail.map(t => t[3])); }

Expr
  = left:Term _ op:("+" / "-" / "*" / "/") _ right:Expr {
      return node("BinaryExpr", { op, left, right }, location);
    }
  / Term

Term
  = MacroArgRef
  / NumberLiteral
  / Register
  / "(" _ e:Expr _ ")" { return e; }
  / Ident { return node("Symbol", { name: text() }, location); }

MacroArgRef
  = "\\" name:$([0-9]+) {
      return node("MacroArgRef", { name }, location);
    }
  / "\\" name:Ident {
      return node("MacroArgRef", { name }, location);
    }

// ======== Common Identifiers / Comments ========

IdentList
  = head:Ident tail:(_ "," _ Ident)* { return [head].concat(tail.map(t => t[3])); }

Ident "identifier"
  = !Reserved $([A-Za-z_][A-Za-z0-9_]*)
    { return text(); }

Reserved
  = ("MACRO"i / "ENDM"i / "REPT"i / "ENDR"i) !([a-zA-Z0-9_])

Comment
  = ";" [^\n\r]*

// ======== Whitespace / NL / BOM ========

BOM = "\uFEFF"
NL  = "\r\n" / "\n" / "\r"
_   = [ \t]*
__  = [ \t]+
WS  = (Comment / [ \t\r\n])+
