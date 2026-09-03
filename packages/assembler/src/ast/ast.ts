// Z80 AST node types (TypeScript)
export type Pos = { offset: number; line: number; column: number };

export interface BaseNode { kind: string; pos: Pos; }

export interface Program extends BaseNode {
  kind: "Program";
  body: Node[];
}

export interface Label extends BaseNode {
  kind: "Label";
  name: string;
}

export interface Labeled extends BaseNode {
  kind: "Labeled";
  label: string;
  stmt: Node;
}

export interface MacroDef extends BaseNode {
  kind: "MacroDef";
  name: string;
  params: string[];
  body: Node[];
}

export interface MacroCall extends BaseNode {
  kind: "MacroCall";
  name: string;
  args: Expr[];
}

export interface Rept extends BaseNode {
  kind: "Rept";
  count: number;
  body: Node[];
}

export interface Directive extends BaseNode {
  kind: "Directive";
  name: string;
  args: Expr[];
}

export interface Instruction extends BaseNode {
  kind: "Instruction";
  mnemonic: string;
  operands: Expr[];
}

export interface NumberLiteral extends BaseNode {
  kind: "NumberLiteral";
  base: 2 | 10 | 16;
  value: number;
}

export interface Register extends BaseNode {
  kind: "Register";
  name: string;
}

export interface SymbolRef extends BaseNode {
  kind: "Symbol";
  name: string;
}

export interface BinaryExpr extends BaseNode {
  kind: "BinaryExpr";
  op: "+" | "-" | "*" | "/";
  left: Expr;
  right: Expr;
}

export type Expr = NumberLiteral | Register | SymbolRef | BinaryExpr;
export type Node =
  | Label
  | Labeled
  | MacroDef
  | MacroCall
  | Rept
  | Directive
  | Instruction;

export type AST = Program;
