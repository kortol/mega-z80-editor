export type ScalarType = "char" | "int";

export type SourceType = {
  kind: "scalar";
  name: ScalarType;
};

export type SourceProgram = {
  kind: "program";
  functions: SourceFunction[];
};

export type SourceFunction = {
  kind: "function";
  name: string;
  returnType: SourceType;
  params: SourceParam[];
  body: SourceBlock;
};

export type SourceParam = {
  kind: "param";
  name: string;
  type: SourceType;
};

export type SourceLocalDecl = {
  kind: "localDecl";
  name: string;
  type: SourceType;
  initializer?: SourceExpr;
};

export type SourceBlock = {
  kind: "block";
  declarations: SourceLocalDecl[];
  statements: SourceStmt[];
};

export type CompareOp = "==" | "!=" | ">" | "<" | ">=" | "<=";
export type ShiftOp = "<<" | ">>";
export type AdditiveOp = "+" | "-";
export type MultiplicativeOp = "*" | "/" | "%";
export type LogicalOp = "&&" | "||";
export type BitwiseOp = "&" | "^" | "|";
export type BinaryOp = LogicalOp | BitwiseOp | CompareOp | ShiftOp | AdditiveOp | MultiplicativeOp;

export type SourceStmt =
  | {
    kind: "return";
    expr: SourceExpr;
  }
  | {
    kind: "expr";
    expr: SourceExpr;
  }
  | {
    kind: "if";
    condition: SourceExpr;
    thenBlock: SourceBlock;
    elseBlock?: SourceBlock;
  }
  | {
    kind: "while";
    condition: SourceExpr;
    body: SourceBlock;
  }
  | {
    kind: "for";
    initializer?: SourceForInit;
    condition?: SourceExpr;
    step?: SourceSimpleStmt;
    body: SourceBlock;
  }
  | {
    kind: "assign";
    name: string;
    expr: SourceExpr;
  }
  | {
    kind: "break";
  }
  | {
    kind: "continue";
  };

export type SourceSimpleStmt =
  | {
    kind: "expr";
    expr: SourceExpr;
  }
  | {
    kind: "assign";
    name: string;
    expr: SourceExpr;
  };

export type SourceForInit =
  | SourceSimpleStmt
  | {
    kind: "localDecl";
    name: string;
    type: SourceType;
    initializer?: SourceExpr;
  };

export type SourceExpr =
  | { kind: "const"; value: number }
  | { kind: "string"; value: string }
  | { kind: "ref"; name: string }
  | { kind: "call"; target: string; args: SourceExpr[] }
  | { kind: "binary"; left: SourceExpr; right: SourceExpr; op: BinaryOp };
