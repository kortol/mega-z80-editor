{
  function pos(location) {
    return { 
      offset: location().start.offset, 
      line: location().start.line, 
      column: location().start.column 
    };
  }

  function node(kind, props, location) {
    return Object.assign(
      { kind, pos: pos(location) },
      props
    );
  }
}
// ======== Program ========

Start
  = EOL* lines:(SourceLine (EOL+ SourceLine)*)? EOL* EOF? {
      const flatLines = lines ? [lines[0]].concat(lines[1].map(x => x[1])) : [];
      return node("Program", { body: flatLines.filter(Boolean) }, location);
    }

SourceLine
  = _ content:LineContent { return content; }

LineContent
  = commentLine
  / labeledLine
  / stmtLine

// ======== Line Types ========

commentLine
  = comment { return null; }

labeledLine
  = lbl:label _ stmt:(instruction / directive)? _ comment? {
      if (stmt)
        return node("Labeled", { label: lbl.name, stmt }, location);
      else
        return node("Label", { name: lbl.name }, location);
    }

stmtLine
  = stmt:(instruction / directive) _ comment? {
      return stmt;
    }

// ======== Core Components ========

instruction
  = opcode:OPCODE _ args:expressionlist? {
      return node("Instruction", { opcode, args: args || [] }, location);
    }

directive
  = name:ASSEMBLER_DIRECTIVE _ args:expressionlist? {
      return node("Directive", { name, args: args || [] }, location);
    }

// ======== Expressions ========

expressionlist
  = head:expression tail:(_ "," _ expression)* {
      return [head, ...tail.map(t => t[3])];
    }

expression
  = head:multiplyingExpression tail:(_ ("+" / "-") _ multiplyingExpression)* {
      return tail.reduce(
        (acc, t) => node("BinaryExpr", { op: t[1], left: acc, right: t[3] }, location),
        head
      );
    }

multiplyingExpression
  = head:argument tail:(_ ("*" / "/") _ argument)* {
      return tail.reduce(
        (acc, t) => node("BinaryExpr", { op: t[1], left: acc, right: t[3] }, location),
        head
      );
    }

argument
  = number
  / register_
  / dollar
  / name
  / string_
  / "(" _ expression _ ")" { return expression; }

// ======== Base Elements ========

label
  = name:name ":"? { return node("Label", { name: name.name }, location); }

dollar
  = "$" { return node("Dollar", {}, location); }

comment
  = ";" [^\n\r]* { return null; }

string_
  = "'" chars:[^']* "'" { return node("String", { value: chars.join("") }, location); }

name
  = n:$([A-Za-z][A-Za-z0-9."]*) { return node("Name", { name: n.toUpperCase() }, location); }

number
  = n:("$"? [0-9A-Fa-f]+ "H"?) { return node("Number", { value: n.join("") }, location); }

register_
  = name:REGISTER { return node("Register", { name }, location); }

// ======== Tokens ========

OPCODE
  = $("ADC"i / "ADD"i / "AND"i / "BIT"i / "CALL"i / "CCF"i / "CP"i / "CPL"i / "DAA"i
     / "DEC"i / "DI"i / "DJNZ"i / "EI"i / "EX"i / "EXX"i / "IM"i / "IN"i / "INC"i
     / "JP"i / "JR"i / "LD"i / "NEG"i / "NOP"i / "OR"i / "POP"i / "PUSH"i
     / "RES"i / "RET"i / "RETI"i / "RETN"i / "RL"i / "RLA"i / "RLC"i / "RLCA"i
     / "RR"i / "RRA"i / "RRC"i / "RRCA"i / "RST"i / "SBC"i / "SCF"i / "SET"i
     / "SLA"i / "SRA"i / "SRL"i / "SUB"i / "XOR"i)

REGISTER
  = $("A"i / "B"i / "C"i / "D"i / "E"i / "H"i / "L"i
     / "IX"i / "IY"i / "SP"i / "AF"i / "BC"i / "DE"i / "HL"i)

ASSEMBLER_DIRECTIVE
  = $("ORG"i / "END"i / "EQU"i / "DEFB"i / "DEFW"i / "DS"i / "SET"i / "IF"i / "ENDIF"i)

// ======== Whitespace ========

EOL = ("\r\n" / "\n" / "\r")
EOF = !.
_ = [ \t]*
